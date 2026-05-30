/**
 * Chat Widget Worker — Main Entry Point
 *
 * Real-time chat widget with AI-powered responses, lead capture, and
 * smart rate limiting. Hosted at https://chat-widget.kadenaweb.solutions.
 *
 * Waves:
 *   Wave 1 (this file) — Core routing, CORS, error handling, health checks
 *   Wave 3              — Chat & message logic
 *   Wave 4              — AI integration
 *   Wave 5              — Lead capture, metrics, admin
 */

import { Router } from './router.js';
import { errorResponse } from './errors.js';
import {
  validateOrigin,
  corsResponse,
  handlePreflight,
} from './middleware/cors.js';
import {
  handleHealthCheck,
  handleSimpleHealthCheck,
} from './health.js';
import { handleChatMessage } from './chat/handler.js';
import { handleChatStream } from './chat/streaming.js';
import { getClientConfig, CHAT_CLIENTS } from './config.js';
import { validateSession } from './chat/session.js';
import { getConversation } from './chat/conversation.js';
import { createLead, extractLeadFromConversation } from './lead/capture.js';
import { dispatchLeadWebhook } from './lead/webhook.js';
import { sanitizeInput, validateEmail, validatePhone } from './security/sanitize.js';
import {
  handleMetrics,
  handleAuditLog,
  handleAdminResetSession,
} from './metrics.js';
import { verifyBearerToken } from './middleware/auth.js';

const VERSION = '1.0.0';

// ─── Route Registration ───────────────────────────────────────────────────────

const router = new Router();

// CORS preflight — wildcard match for all OPTIONS requests
router.add('OPTIONS', '*', async (_request, _env, _ctx, _params, origin) => {
  return handlePreflight(origin);
});

// GET /chat-widget.js — Serve widget JS bundle from Pages deployment
router.add('GET', '/chat-widget.js', async (_request, _env, _ctx, _params, _origin) => {
  const WIDGET_URL = 'https://master.chat-widget-assets.pages.dev/chat-widget.js';
  const response = await fetch(WIDGET_URL, { cf: { cacheEverything: true } });
  if (!response.ok) {
    return new Response('// Widget unavailable', { status: 502, headers: { 'Content-Type': 'application/javascript' } });
  }
  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

// GET / — Service info
router.add('GET', '/', async (_request, _env, _ctx, _params, origin) => {
  return corsResponse({
    service: 'Kadena Chat Widget Worker',
    version: VERSION,
    docs: 'https://github.com/Kadena-Web-Solutions/chat-widget',
    health: '/health',
    endpoints: {
      chat: '/api/chat',
      chatStream: '/api/chat/stream',
      lead: '/api/lead',
      history: '/api/chat/:id',
      config: '/api/config',
      metrics: '/metrics/:client/:month',
      auditLog: '/log/:clientKey',
      adminResetSession: '/admin/reset-session',
    },
  }, 200, origin);
});

// GET /health — Detailed health check
router.add('GET', '/health', async (request, env, ctx, _params, origin) => {
  return handleHealthCheck(env, origin);
});

// GET /health/simple — Simple uptime check
router.add('GET', '/health/simple', async (_request, _env, _ctx, _params, origin) => {
  return handleSimpleHealthCheck(origin);
});

// GET /api/health/detailed — Diagnostic binding check (no D1/KV probe queries)
router.add('GET', '/api/health/detailed', async (_request, env, _ctx, _params, origin) => {
  const checks = {
    d1: !!env.DB,
    kv_sessions: !!env.CHAT_SESSIONS,
    kv_rate_limit: !!env.CHAT_RATE_LIMIT,
    kv_config: !!env.CHAT_CONFIG,
    kv_budget: !!env.CHAT_BUDGET,
    ai: !!env.AI,
    turnstile_configured: !!env.TURNSTILE_SECRET_KEY,
    version: VERSION,
    timestamp: new Date().toISOString(),
    allowed_origins: Object.values(CHAT_CLIENTS).flatMap(c => c.allowedOrigins || []),
  };

  return corsResponse(checks, 200, origin);
});

// ─── Chat Endpoints ───────────────────────────────────────────────────────────

// POST /api/chat — Start or continue a conversation
router.add('POST', '/api/chat', (request, env, ctx, params, origin) => {
  return handleChatMessage(request, env, ctx, params, origin);
});

// POST /api/chat/stream — Start conversation with SSE streaming
router.add('POST', '/api/chat/stream', (request, env, ctx, params, origin) => {
  return handleChatStream(request, env, ctx, params, origin);
});

// GET /api/chat/:id — Get conversation history (session token required)
router.add('GET', '/api/chat/:id', async (request, env, ctx, params, origin) => {
  const token = extractSessionToken(request);
  if (!token) {
    return corsResponse({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Session token required' },
    }, 401, origin);
  }

  const session = await validateSession(token, env);
  if (!session) {
    return corsResponse({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Session expired or invalid' },
    }, 401, origin);
  }

  try {
    const result = await getConversation(params.id, env);

    // Verify the conversation belongs to this session
    if (result.conversation.sessionToken !== token) {
      return corsResponse({
        error: { code: 'AUTHENTICATION_ERROR', message: 'Access denied' },
      }, 403, origin);
    }

    return corsResponse(result, 200, origin);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return corsResponse({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      }, 404, origin);
    }
    throw err;
  }
});

// ─── Lead Endpoint ────────────────────────────────────────────────────────────

// POST /api/lead — Submit lead capture form (session token required)
router.add('POST', '/api/lead', async (request, env, ctx, params, origin) => {
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) {
    return corsResponse({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Session token required' },
    }, 401, origin);
  }

  const session = await validateSession(sessionToken, env);
  if (!session) {
    return corsResponse({
      error: { code: 'AUTHENTICATION_ERROR', message: 'Session expired or invalid' },
    }, 401, origin);
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
      }, 400, origin);
    }

    const name = sanitizeInput(body.name, 200);
    const email = sanitizeInput(body.email, 200);
    const phone = sanitizeInput(body.phone, 50);
    const message = sanitizeInput(body.message, 5000);

    if (!email && !name) {
      return corsResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Name or email is required' },
      }, 400, origin);
    }

    const emailResult = validateEmail(email);
    if (email && !emailResult.valid) {
      return corsResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' },
      }, 400, origin);
    }

    const clientConfig = getClientConfig(request);
    const clientKey = resolveClientKey(request);
    const conversationId = session.conversationId || null;

    const result = await createLead({
      conversationId,
      clientKey,
      name: name || null,
      email: emailResult.valid ? emailResult.sanitized : null,
      phone: phone || null,
      message: message || null,
      source: 'form',
    }, env);

    const lead = {
      id: result.leadId,
      conversationId,
      clientKey,
      name: name || null,
      email: emailResult.valid ? emailResult.sanitized : null,
      phone: phone || null,
      message: message || null,
      score: 50,
    };

    ctx.waitUntil(
      dispatchLeadWebhook(lead, clientKey, clientConfig, env)
    );

    return corsResponse({
      success: true,
      lead: {
        id: lead.id,
        score: lead.score,
        status: 'new',
      },
    }, 200, origin);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return corsResponse({
        error: { code: error.code, message: error.message },
      }, 400, origin);
    }
    console.error('💥 [lead] Error:', error);
    return corsResponse({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process lead' },
    }, 500, origin);
  }
});

// ─── Config Endpoint ──────────────────────────────────────────────────────────

// GET /api/config — Get widget configuration for client (no auth required)
router.add('GET', '/api/config', async (request, env, ctx, params, origin) => {
  const url = new URL(request.url);
  const clientKey = url.searchParams.get('client');
  let kvConfig = null;

  if (clientKey && env.CHAT_CONFIG) {
    try {
      kvConfig = await env.CHAT_CONFIG.get(`chat:config:${clientKey}`, 'json');
    } catch (e) {
      console.warn('[config] KV read error, falling back to hardcoded:', e.message);
    }
  }

  const clientConfig = kvConfig || getClientConfig(request);

  const isFromKV = !!kvConfig;
  const name = isFromKV ? (clientKey || clientConfig.name || 'Unknown') : clientConfig.name;
  const chat = isFromKV ? clientConfig : (clientConfig.chat || {});

  const enabled = chat.enabled ?? true;

  return corsResponse({
    name,
    has_chat: enabled !== false,
    chat: {
      enabled,
      botName: chat.botName,
      welcomeMessage: chat.welcomeMessage,
      primaryColor: chat.primaryColor,
      secondaryColor: chat.secondaryColor,
      fontFamily: chat.fontFamily,
      botAvatar: chat.botAvatar,
      position: chat.position || 'bottom-right',
      disclaimer: chat.disclaimer,
      leadCaptureAfter: chat.leadCaptureAfter || 3,
      sessionTimeout: chat.sessionTimeout || 600,
    },
  }, 200, origin);
});

// ─── Metrics / Admin Endpoints (Bearer Auth) ──────────────────────────────────

// GET /metrics/:client/:month — Monthly metrics (Bearer auth)
router.add('GET', '/metrics/:client/:month', async (request, env, ctx, params, origin) => {
  return handleMetrics(request, env, ctx, params, origin);
});

// GET /log/:clientKey — Audit log view (Bearer auth)
router.add('GET', '/log/:clientKey', async (request, env, ctx, params, origin) => {
  return handleAuditLog(request, env, ctx, params, origin);
});

// POST /admin/reset-session — Force session expiry (Bearer auth)
router.add('POST', '/admin/reset-session', async (request, env, ctx, params, origin) => {
  return handleAdminResetSession(request, env, ctx, params, origin);
});

// ─── Worker Entry Point ───────────────────────────────────────────────────────

export default {
  /**
   * Main fetch handler — all requests route through here.
   *
   * @param {Request} request
   * @param {Object} env — Worker bindings (D1, KV, AI, secrets)
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = await validateOrigin(request);

    try {
      // ── CORS Preflight ──────────────────────────────────────────────────
      if (request.method === 'OPTIONS') {
        return handlePreflight(origin);
      }

      // ── Route Matching ──────────────────────────────────────────────────
      const match = router.match(request.method, url.pathname);

      if (!match) {
        // No matching route
        return corsResponse({
          error: { code: 'NOT_FOUND', message: `Route not found: ${request.method} ${url.pathname}` },
        }, 404, origin);
      }

      // ── Execute Handler ─────────────────────────────────────────────────
      return await match.handler(request, env, ctx, match.params, origin);

    } catch (error) {
      // Top-level error boundary — catches unhandled errors from any handler
      console.error(`💥 Unhandled error [${request.method} ${url.pathname}]:`, error);
      return errorResponse(error, origin);
    }
  },
};

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract session token from request.
 * Looks in query param 'token' first, then X-Session-Token header.
 *
 * @param {Request} request
 * @returns {string|null}
 */
function extractSessionToken(request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken;

  return request.headers.get('X-Session-Token');
}

/**
 * Resolve the CHAT_CLIENTS key from the request Origin header.
 *
 * @param {Request} request
 * @returns {string} Client key (e.g., 'mkstucco.com') or 'default'
 */
function resolveClientKey(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return 'default';

  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return 'default';
  }

  for (const [key, config] of Object.entries(CHAT_CLIENTS)) {
    if (key === 'default') continue;
    if (config.allowedOrigins && config.allowedOrigins.includes(hostname)) {
      return key;
    }
  }

  return 'default';
}
