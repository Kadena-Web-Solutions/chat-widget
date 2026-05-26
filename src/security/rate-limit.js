/**
 * Two-Tier Rate Limiting via KV (CHAT_RATE_LIMIT)
 *
 * Implements rate limiting at two levels using Cloudflare KV:
 *
 *   Tier 1 — Per-conversation messages:
 *     Key:   ratelimit:msg:{ip}:{YYYY-MM-DD-HH}
 *     Limit: 20 messages per IP per hour
 *     TTL:   3600 seconds (1 hour)
 *
 *   Tier 2 — Per-IP new conversations:
 *     Key:   ratelimit:conv:{ip}:{YYYY-MM-DD-HH}
 *     Limit: 5 new conversations per IP per hour
 *     TTL:   3600 seconds (1 hour)
 *
 * Each KV value is stored as JSON: { count: number, resetAt: timestamp }
 *
 * All hour calculations use UTC.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

const MSG_LIMIT = 20;
const CONV_LIMIT = 5;
const TTL_SECONDS = 3600;

// ─── Key Generation ────────────────────────────────────────────────────────────

/**
 * Generate a rate limit KV key with UTC hour granularity.
 *
 * @param {string} prefix - Key prefix ('ratelimit:msg' or 'ratelimit:conv')
 * @param {string} ip - Client IP address
 * @returns {string} KV key in format: {prefix}:{ip}:{YYYY-MM-DD-HH}
 */
export function getHourKey(prefix, ip) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');

  return `${prefix}:${ip}:${year}-${month}-${day}-${hour}`;
}

// ─── KV Helpers ────────────────────────────────────────────────────────────────

/**
 * Read the current rate limit state from KV.
 * Returns null if no entry exists or the entry has expired.
 *
 * @param {string} key - KV key
 * @param {Object} env - Worker bindings
 * @returns {Promise<null|{ count: number, resetAt: number }>}
 */
async function _readState(key, env) {
  try {
    const raw = await env.CHAT_RATE_LIMIT.get(key);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Skip stale entries older than TTL
    if (Date.now() > state.resetAt) return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * Write or update a rate limit state to KV.
 *
 * @param {string} key - KV key
 * @param {{ count: number, resetAt: number }} state - Rate limit state
 * @param {Object} env - Worker bindings
 */
async function _writeState(key, state, env) {
  try {
    await env.CHAT_RATE_LIMIT.put(key, JSON.stringify(state), {
      expirationTtl: TTL_SECONDS,
    });
  } catch (err) {
    // Non-fatal — log and let the request through
    console.warn('⚠️  Rate limit KV write failed:', err.message || err);
  }
}

// ─── Increment Operations ──────────────────────────────────────────────────────

/**
 * Increment the message count for an IP in the current hour.
 *
 * @param {string} ip - Client IP address
 * @param {Object} env - Worker bindings
 * @returns {Promise<number>} Updated message count
 */
export async function incrementMessageCount(ip, env) {
  const key = getHourKey('ratelimit:msg', ip);
  const state = await _readState(key, env);
  const now = Date.now();

  if (!state) {
    const newState = { count: 1, resetAt: now + TTL_SECONDS * 1000 };
    await _writeState(key, newState, env);
    return 1;
  }

  state.count += 1;
  await _writeState(key, state, env);
  return state.count;
}

/**
 * Increment the conversation count for an IP in the current hour.
 *
 * @param {string} ip - Client IP address
 * @param {Object} env - Worker bindings
 * @returns {Promise<number>} Updated conversation count
 */
export async function incrementConversationCount(ip, env) {
  const key = getHourKey('ratelimit:conv', ip);
  const state = await _readState(key, env);
  const now = Date.now();

  if (!state) {
    const newState = { count: 1, resetAt: now + TTL_SECONDS * 1000 };
    await _writeState(key, newState, env);
    return 1;
  }

  state.count += 1;
  await _writeState(key, state, env);
  return state.count;
}

// ─── Rate Limit Check ──────────────────────────────────────────────────────────

/**
 * Check rate limits for both tiers (messages and conversations).
 * Returns whether the request is allowed and, if blocked, how long to wait.
 *
 * On KV read errors, the request is allowed through (fail-open) to avoid
 * blocking legitimate users due to infrastructure issues.
 *
 * @param {string} ip - Client IP address
 * @param {string} _clientKey - Client identifier (reserved for future use)
 * @param {Object} env - Worker bindings
 * @returns {Promise<{
 *   allowed: boolean,
 *   retryAfter?: number,
 *   limit: { messages: number, conversations: number }
 * }>}
 */
export async function checkRateLimit(ip, clientKey, env) {
  const now = Date.now();
  const msgKey = getHourKey('ratelimit:msg', ip);
  const convKey = getHourKey('ratelimit:conv', ip);

  let msgState;
  let convState;

  try {
    msgState = await _readState(msgKey, env);
    convState = await _readState(convKey, env);
  } catch (err) {
    // KV read failure — allow the request (fail-open)
    console.warn('⚠️  Rate limit KV read failed:', err.message || err);
    return {
      allowed: true,
      limit: { messages: MSG_LIMIT, conversations: CONV_LIMIT },
    };
  }

  const msgCount = msgState?.count || 0;
  const convCount = convState?.count || 0;

  // Determine the next reset time (earliest of both windows)
  const msgResetAt = msgState?.resetAt || (now + TTL_SECONDS * 1000);
  const convResetAt = convState?.resetAt || (now + TTL_SECONDS * 1000);
  const nextResetAt = Math.min(msgResetAt, convResetAt);

  // Check limits
  if (msgCount >= MSG_LIMIT || convCount >= CONV_LIMIT) {
    const retryAfter = Math.max(0, Math.ceil((nextResetAt - now) / 1000));
    return {
      allowed: false,
      retryAfter,
      limit: { messages: MSG_LIMIT, conversations: CONV_LIMIT },
    };
  }

  return {
    allowed: true,
    limit: { messages: MSG_LIMIT, conversations: CONV_LIMIT },
  };
}

// ─── Read-Only Status ──────────────────────────────────────────────────────────

/**
 * Get current rate limit status without incrementing any counters.
 * Useful for exposing rate limit info to clients or admin dashboards.
 *
 * @param {string} ip - Client IP address
 * @param {Object} env - Worker bindings
 * @returns {Promise<{
 *   messages: { count: number, limit: number, resetAt: number },
 *   conversations: { count: number, limit: number, resetAt: number }
 * }>}
 */
export async function getRateLimitStatus(ip, env) {
  const now = Date.now();
  const msgKey = getHourKey('ratelimit:msg', ip);
  const convKey = getHourKey('ratelimit:conv', ip);

  let msgState;
  let convState;

  try {
    msgState = await _readState(msgKey, env);
    convState = await _readState(convKey, env);
  } catch {
    msgState = null;
    convState = null;
  }

  return {
    messages: {
      count: msgState?.count || 0,
      limit: MSG_LIMIT,
      resetAt: msgState?.resetAt || (now + TTL_SECONDS * 1000),
    },
    conversations: {
      count: convState?.count || 0,
      limit: CONV_LIMIT,
      resetAt: convState?.resetAt || (now + TTL_SECONDS * 1000),
    },
  };
}
