/**
 * Health check module for the Chat Widget Worker.
 *
 * Handles:
 *   GET /health        — Detailed health check (D1 + KV + AI Gateway + Turnstile)
 *   GET /health/simple — Minimal 200 OK for basic uptime monitors
 *
 * Follows the contact-form pattern at /data/workspace/contact-form/src/health.js.
 */

import { corsResponse } from './middleware/cors.js';

const VERSION = '1.0.0';

/**
 * Handle GET /health — detailed dependency check.
 *
 * Checks:
 *   1. D1 database   — SELECT 1 probe
 *   2. KV namespaces  — read test on each binding
 *   3. AI Gateway     — binding presence check
 *   4. Turnstile      — secret key configured
 *
 * @param {Object} env - Worker environment bindings
 * @param {string} allowedOrigin - CORS origin
 * @returns {Promise<Response>}
 */
export async function handleHealthCheck(env, allowedOrigin) {
  const checks = {};
  let overallHealthy = true;

  // 1. D1 Database probe
  checks.d1 = await checkD1(env.DB);
  if (!checks.d1.ok) overallHealthy = false;

  // 2. KV Namespace checks
  checks.kvChatSessions = await checkKV(env.CHAT_SESSIONS, 'CHAT_SESSIONS');
  if (!checks.kvChatSessions.ok) overallHealthy = false;

  checks.kvChatRateLimit = await checkKV(env.CHAT_RATE_LIMIT, 'CHAT_RATE_LIMIT');
  if (!checks.kvChatRateLimit.ok) overallHealthy = false;

  // CHAT_CONFIG is optional — don't fail overall health
  checks.kvChatConfig = await checkKV(env.CHAT_CONFIG, 'CHAT_CONFIG');
  if (!checks.kvChatConfig.ok) {
    checks.kvChatConfig.note = 'optional';
  }

  // CHAT_BUDGET is optional — don't fail overall health
  checks.kvChatBudget = await checkKV(env.CHAT_BUDGET, 'CHAT_BUDGET');
  if (!checks.kvChatBudget.ok) {
    checks.kvChatBudget.note = 'optional';
  }

  // 3. AI Gateway binding
  checks.aiGateway = checkAIBinding(env.AI);
  if (!checks.aiGateway.ok) overallHealthy = false;

  // 4. Turnstile secret configured
  checks.turnstile = {
    ok: !!env.TURNSTILE_SECRET_KEY,
    status: env.TURNSTILE_SECRET_KEY ? 'configured' : 'not configured',
  };
  // Turnstile is optional for development

  const status = overallHealthy ? 'healthy' : 'degraded';
  const httpStatus = overallHealthy ? 200 : 503;

  return corsResponse({
    status,
    version: VERSION,
    timestamp: new Date().toISOString(),
    services: checks,
  }, httpStatus, allowedOrigin);
}

/**
 * Handle GET /health/simple — minimal 200 OK for uptime monitors.
 *
 * @param {string} allowedOrigin - CORS origin
 * @returns {Response}
 */
export function handleSimpleHealthCheck(allowedOrigin) {
  return corsResponse({ status: 'ok', version: VERSION }, 200, allowedOrigin);
}

// ─── Internal Health Probes ───────────────────────────────────────────────────

/**
 * Probe D1 database with a lightweight SELECT 1 query.
 */
async function checkD1(db) {
  if (!db) {
    return { ok: false, status: 'not bound' };
  }

  try {
    const result = await db.prepare('SELECT 1 AS ok').first();
    return result
      ? { ok: true, status: 'ok' }
      : { ok: false, status: 'query returned null' };
  } catch (err) {
    return { ok: false, status: `error: ${err.message}` };
  }
}

/**
 * Probe a KV namespace with a simple read test.
 */
async function checkKV(kvBinding, name) {
  if (!kvBinding) {
    return { ok: false, status: 'not bound' };
  }

  try {
    // Simple read test — key won't exist but KV should respond without error
    await kvBinding.get('__health_check__');
    return { ok: true, status: 'ok' };
  } catch (err) {
    return { ok: false, status: `error: ${err.message}` };
  }
}

/**
 * Check that the Workers AI binding is present and configured.
 */
function checkAIBinding(aiBinding) {
  if (!aiBinding) {
    return { ok: false, status: 'not bound' };
  }

  // Workers AI binding is a proxy object — presence check is sufficient
  // The actual model availability is verified at call time
  return { ok: true, status: 'configured' };
}
