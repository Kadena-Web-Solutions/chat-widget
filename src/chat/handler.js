/**
 * Chat Message Handler — non-streaming POST /api/chat
 *
 * Full flow:
 *   1. Parse JSON body
 *   2. Validate Turnstile token (first message only)
 *   3. Validate or create session
 *   4. Resolve client config from Origin header
 *   5. Sanitize user message
 *   6. Check rate limit
 *   7. Check AI budget
 *   8. Create/get conversation in D1
 *   9. Append user message to D1
 *   10. Get system prompt (handled by gateway)
 *   11. Call sendToAI() — non-streaming, returns complete response text
 *   12. Append assistant response to D1
 *   13. Increment message count in session
 *   14. Check if lead capture threshold reached
 *   15. Return JSON: { conversationId, messageId, content, leadCaptureNeeded, sessionToken }
 */

import { ChatError, ValidationError } from '../errors.js';
import { corsResponse } from '../middleware/cors.js';
import { checkBudget, sendToAI } from '../ai/gateway.js';
import { getClientConfig, CHAT_CLIENTS } from '../config.js';
import {
  createConversation,
  getConversation,
  appendMessage,
} from './conversation.js';
import {
  createSession,
  validateSession,
  incrementMessageCount,
} from './session.js';
import { extractSessionToken } from '../middleware/session.js';
import { checkRateLimit } from '../middleware/rate-limit.js';
import { incrementMessageCount as incRateLimitCount } from '../security/rate-limit.js';
import {
  extractTurnstileToken,
  verifyTurnstile,
} from '../security/turnstile.js';
import { sanitizeInput, detectInjection } from '../security/sanitize.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the CHAT_CLIENTS key from the request Origin header.
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

/**
 * Extract the client IP for rate limiting.
 * @param {Request} request
 * @returns {string}
 */
function extractIP(request) {
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP.trim();

  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();

  return 'unknown';
}

// ─── Handler ───────────────────────────────────────────────────────────────────

/**
 * Handle POST /api/chat — non-streaming chat (returns complete JSON response).
 *
 * @param {Request} request
 * @param {Object} env — Worker bindings (D1, KV, AI, secrets)
 * @param {ExecutionContext} ctx
 * @param {Object} params — Route params (empty for this path)
 * @param {string} origin — Validated CORS origin
 * @returns {Promise<Response>}
 */
export async function handleChatMessage(request, env, ctx, params, origin) {
  // ── 1. Parse JSON body ──────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  const userMessage = body.message;
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    throw new ValidationError('Message is required');
  }

  // ── 2. Resolve client config & key ──────────────────────────────────────
  const clientConfig = getClientConfig(request);
  let clientKey = resolveClientKey(request);

  // ── 3. Sanitize user message ────────────────────────────────────────────
  const sanitized = sanitizeInput(userMessage, 2000);
  if (!sanitized) {
    throw new ValidationError('Message is empty after sanitization');
  }

  // Report injection detections as early-warning (non-blocking)
  const injection = detectInjection(sanitized);
  if (injection.detected) {
    console.warn('[handler] Prompt injection patterns detected:', injection.patterns.join(', '));
  }

  // ── 4. Session — validate existing or create new ────────────────────────
  let session = null;
  let sessionToken = null;
  let conversationId = null;

  // Extract token from header first, then body ("session" field)
  const existingToken = extractSessionToken(request) || body.session;
  if (existingToken) {
    session = await validateSession(existingToken, env);
    if (session) {
      sessionToken = existingToken;
      conversationId = session.conversationId;
      clientKey = session.clientKey;
    }
  }

  // ── 5. Turnstile verification (first message only) ─────────────────────
  if (!session) {
    const turnstileToken = await extractTurnstileToken(request);
    if (turnstileToken) {
      const verification = await verifyTurnstile(turnstileToken, env);
      if (!verification.success) {
        throw new ValidationError(verification.error || 'Turnstile verification failed');
      }
    } else if (env.TURNSTILE_SECRET_KEY) {
      console.warn('[handler] No Turnstile token provided — skipping verification');
    }

    session = await createSession(clientKey, env, existingToken || null);
    sessionToken = session.token;
    conversationId = session.conversationId;

    await createConversation(clientKey, sessionToken, env, conversationId);
  }

  // ── 6. Rate limit check ────────────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(request, env);
  if (!rateLimitResult.allowed) {
    throw new ChatError(
      `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter || 60} seconds.`,
      429,
      'RATE_LIMIT_ERROR',
    );
  }

  // ── 7. AI budget check ─────────────────────────────────────────────────
  await checkBudget(clientKey, env);

  // ── 8. Append user message to D1 ───────────────────────────────────────
  await appendMessage(conversationId, 'user', sanitized, null, null, env);

  // ── 9. Increment rate limit counter (async, non-blocking) ──────────────
  const ip = extractIP(request);
  ctx.waitUntil(incRateLimitCount(ip, env).catch(err => {
    console.warn('[handler] Rate limit increment failed:', err.message);
  }));

  // ── 10. Load full message history for AI context ───────────────────────
  const { messages: history } = await getConversation(conversationId, env);
  const aiMessages = history.map(m => ({ role: m.role, content: m.content }));

  // ── 11. Call sendToAI — non-streaming, returns complete response text ──
  let responseText;
  try {
    responseText = await sendToAI(aiMessages, clientKey, clientConfig, env, ctx, { stream: false });
  } catch (err) {
    // Gateway already throws ChatError for budget exceeded, AI unavailable, etc.
    throw err;
  }

  // ── 12. Append assistant response to D1 ────────────────────────────────
  const assistantMsg = await appendMessage(conversationId, 'assistant', responseText, null, null, env);

  // ── 13. Increment session message count ────────────────────────────────
  const updatedSession = await incrementMessageCount(sessionToken, env);
  const msgCount = updatedSession ? updatedSession.messageCount : 0;

  // ── 14. Check lead capture threshold ───────────────────────────────────
  const leadCaptureAfter = clientConfig.chat?.leadCaptureAfter || 3;
  const leadCaptureNeeded = msgCount >= leadCaptureAfter;

  // ── 15. Return JSON response ───────────────────────────────────────────
  return corsResponse({
    conversationId,
    messageId: assistantMsg.id,
    content: responseText,
    leadCaptureNeeded,
    sessionToken,
  }, 200, origin, {
    'X-Session-Token': sessionToken,
  });
}
