/**
 * Metrics & Admin Handlers for the Chat Widget Worker.
 *
 * Handles:
 *   GET  /metrics/:client/:month  — Monthly conversation/lead/message metrics
 *   GET  /log/:clientKey           — Audit event log (most recent 100)
 *   POST /admin/reset-session      — Force-expire a chat session
 *
 * All endpoints require Bearer token authentication via verifyBearerToken().
 * ALL D1 queries use parameterized `?` placeholders (zero string interpolation).
 */

import { CHAT_CLIENTS } from './config.js';
import { corsResponse } from './middleware/cors.js';
import { verifyBearerToken } from './middleware/auth.js';
import { AuthenticationError, ValidationError, NotFoundError, InternalError } from './errors.js';
import { expireSession } from './chat/session.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find a client config from the CHAT_CLIENTS registry by a short key.
 *
 * Handles both domain-based keys (e.g. "mkstucco.com") and short-form
 * keys (e.g. "mkstucco") by stripping the TLD suffix for comparison.
 *
 * @param {string} clientKey — Client key from URL param
 * @returns {{ config: Object, dbKey: string } | null}
 */
function findClientConfig(clientKey) {
  // Exact match on CHAT_CLIENTS key
  if (CHAT_CLIENTS[clientKey]) {
    return { config: CHAT_CLIENTS[clientKey], dbKey: clientKey };
  }

  // Fuzzy match: strip trailing TLD from domain-based keys
  for (const [key, config] of Object.entries(CHAT_CLIENTS)) {
    if (key === 'default') continue;
    // e.g. "mkstucco" matches "mkstucco.com"
    const domainKey = key.replace(/\.[a-z]+$/, '');
    if (domainKey === clientKey) {
      return { config, dbKey: key };
    }
  }

  return null;
}

/**
 * Parse a YYYY-MM month string into unixepoch start/end timestamps.
 *
 * @param {string} monthStr — Month in "YYYY-MM" format
 * @returns {{ start: number, end: number }}
 */
function monthToUnixRange(monthStr) {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new ValidationError(`Invalid month format: "${monthStr}". Expected YYYY-MM.`);
  }

  const year  = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    throw new ValidationError(`Invalid month: ${month}. Must be between 01 and 12.`);
  }

  // Start of month: first day, 00:00:00 UTC
  const start = Math.floor(new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).getTime() / 1000);

  // End of month: last day, 23:59:59 UTC
  const end = Math.floor(new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime() / 1000);

  return { start, end };
}

// ─── Metrics Handler ──────────────────────────────────────────────────────────

/**
 * Handle GET /metrics/:client/:month — Monthly aggregated metrics.
 *
 * Requires Bearer token authentication.
 * Queries D1 for conversation, lead, and message stats for the given
 * client and month. Reads token budget from KV CHAT_BUDGET.
 *
 * @param {Request}  request — Incoming HTTP request
 * @param {Object}   env     — Worker environment bindings (DB, KV, secrets)
 * @param {Object}   ctx     — ExecutionContext
 * @param {Object}   params  — URL params: { client, month }
 * @param {string}   origin  — Validated CORS origin
 * @returns {Promise<Response>}
 */
export async function handleMetrics(request, env, ctx, params, origin) {
  // 1. Auth
  if (!verifyBearerToken(request, env)) {
    throw new AuthenticationError('Invalid admin token');
  }

  // 2. Validate client
  const found = findClientConfig(params.client);
  if (!found) {
    throw new NotFoundError(`Unknown client: "${params.client}"`);
  }
  const { dbKey } = found;

  // 3. Validate & parse month
  const { start, end } = monthToUnixRange(params.month);

  // 4. Query D1 for conversation counts by status
  let convRow;
  try {
    convRow = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated,
         SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS expired
       FROM conversations
       WHERE client_key = ? AND created_at >= ? AND created_at <= ?`
    )
      .bind(dbKey, start, end)
      .first();
  } catch (err) {
    throw new InternalError(`Failed to query conversation metrics: ${err.message}`);
  }

  // 5. Query D1 for lead stats
  let leadRow;
  try {
    leadRow = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(AVG(lead_score), 0) AS avgScore,
         SUM(CASE WHEN status = 'new'       THEN 1 ELSE 0 END) AS newCount,
         SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
         SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
       FROM leads
       WHERE client_key = ? AND created_at >= ? AND created_at <= ?`
    )
      .bind(dbKey, start, end)
      .first();
  } catch (err) {
    throw new InternalError(`Failed to query lead metrics: ${err.message}`);
  }

  // 6. Query D1 for total messages in this client's conversations this month
  let msgRow;
  try {
    msgRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.client_key = ? AND m.created_at >= ? AND m.created_at <= ?`
    )
      .bind(dbKey, start, end)
      .first();
  } catch (err) {
    throw new InternalError(`Failed to query message metrics: ${err.message}`);
  }

  const totalConversations = convRow ? convRow.total : 0;
  const totalMessages      = msgRow  ? msgRow.total  : 0;
  const perConversation    = totalConversations > 0
    ? Math.round((totalMessages / totalConversations) * 10) / 10
    : 0;

  // 7. Read token budget from KV CHAT_BUDGET
  let tokensUsed  = 0;
  let budgetLimit = 500000; // default budget
  try {
    const budgetData = await env.CHAT_BUDGET.get(`budget:${dbKey}`);
    if (budgetData) {
      const parsed = JSON.parse(budgetData);
      tokensUsed  = parsed.used  || 0;
      budgetLimit = parsed.limit || budgetLimit;
    }
  } catch {
    // KV read failure is non-fatal — use defaults
  }

  const percentUsed = budgetLimit > 0
    ? Math.round((tokensUsed / budgetLimit) * 100)
    : 0;

  // 8. Build response
  return corsResponse({
    client: params.client,
    month:  params.month,
    conversations: {
      total:     totalConversations,
      active:    convRow ? convRow.active    : 0,
      completed: convRow ? convRow.completed : 0,
      escalated: convRow ? convRow.escalated : 0,
    },
    messages: {
      total:          totalMessages,
      perConversation,
    },
    leads: {
      total:    leadRow ? leadRow.total    : 0,
      avgScore: leadRow ? Math.round(leadRow.avgScore) : 0,
      byStatus: {
        new:       leadRow ? leadRow.newCount   : 0,
        qualified: leadRow ? leadRow.qualified  : 0,
        converted: leadRow ? leadRow.converted  : 0,
      },
    },
    tokens: {
      used:        tokensUsed,
      budget:      budgetLimit,
      percentUsed,
    },
  }, 200, origin);
}

// ─── Audit Log Handler ────────────────────────────────────────────────────────

/**
 * Handle GET /log/:clientKey — Audit event log.
 *
 * Requires Bearer token authentication.
 * Returns the most recent 100 audit_events rows for the given client key.
 *
 * @param {Request}  request — Incoming HTTP request
 * @param {Object}   env     — Worker environment bindings (DB)
 * @param {Object}   ctx     — ExecutionContext
 * @param {Object}   params  — URL params: { clientKey }
 * @param {string}   origin  — Validated CORS origin
 * @returns {Promise<Response>}
 */
export async function handleAuditLog(request, env, ctx, params, origin) {
  // 1. Auth
  if (!verifyBearerToken(request, env)) {
    throw new AuthenticationError('Invalid admin token');
  }

  // 2. Validate client (optional — audit log can contain entries for unknown clients)
  const clientKey = params.clientKey;

  // 3. Query audit_events, most recent 100
  let { results } = { results: [] };
  try {
    const queryResult = await env.DB.prepare(
      `SELECT id, client_key, event_type, event_data, created_at
       FROM audit_events
       WHERE client_key = ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
      .bind(clientKey)
      .all();

    results = queryResult.results || [];
  } catch (err) {
    throw new InternalError(`Failed to query audit log: ${err.message}`);
  }

  // 4. Format rows
  const events = results.map(row => ({
    id:         row.id,
    clientKey:  row.client_key,
    eventType:  row.event_type,
    eventData:  row.event_data ? safeParseJSON(row.event_data) : null,
    createdAt:  row.created_at,
  }));

  return corsResponse(events, 200, origin);
}

// ─── Admin Reset Session Handler ──────────────────────────────────────────────

/**
 * Handle POST /admin/reset-session — Force-expire a chat session.
 *
 * Requires Bearer token authentication.
 * Expects JSON body: { "sessionToken": "..." }
 *
 * Calls expireSession() which deletes the KV session and marks the
 * associated conversation as expired in D1.
 *
 * @param {Request}  request — Incoming HTTP request
 * @param {Object}   env     — Worker environment bindings
 * @param {Object}   ctx     — ExecutionContext
 * @param {Object}   params  — URL params (unused)
 * @param {string}   origin  — Validated CORS origin
 * @returns {Promise<Response>}
 */
export async function handleAdminResetSession(request, env, ctx, params, origin) {
  // 1. Auth
  if (!verifyBearerToken(request, env)) {
    throw new AuthenticationError('Invalid admin token');
  }

  // 2. Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }

  const sessionToken = body.sessionToken;
  if (!sessionToken || typeof sessionToken !== 'string') {
    throw new ValidationError('Missing required field: sessionToken');
  }

  // 3. Expire the session
  try {
    await expireSession(sessionToken, env);
  } catch (err) {
    throw new InternalError(`Failed to expire session: ${err.message}`);
  }

  return corsResponse({ success: true }, 200, origin);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string, returning the original string on failure.
 *
 * @param {string} str
 * @returns {*}
 */
function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
