/**
 * Chat Streaming Handler — SSE-based streaming for POST /api/chat/stream
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
 *   11. Call streamAIResponse() — returns SSE ReadableStream
 *   12. Pipe through wrapper that emits conversationId header + forwards tokens
 *   13. Return Response with SSE content type and CORS headers
 *
 * SSE format (matches widget/streaming-client.js expectations):
 *   data: {"conversationId":"abc-123","role":"assistant"}\n\n     (initial event)
 *   data: {"content":"Hello"}\n\n                                (token chunks)
 *   data: [DONE]\n\n                                             (end marker)
 */

import { ChatError, ValidationError } from '../errors.js';
import { checkBudget, streamAIResponse } from '../ai/gateway.js';
import { getClientConfig, CHAT_CLIENTS } from '../config.js';
import { SECURITY_HEADERS, CORS_HEADERS, validateOrigin } from '../middleware/cors.js';
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
 * Handle POST /api/chat/stream — Server-Sent Events streaming chat.
 *
 * @param {Request} request
 * @param {Object} env — Worker bindings (D1, KV, AI, secrets)
 * @param {ExecutionContext} ctx
 * @param {Object} params — Route params (empty for this path)
 * @param {string} origin — Validated CORS origin
 * @returns {Promise<Response>}
 */
export async function handleChatStream(request, env, ctx, params, origin) {
  console.log('[streaming] Request received:', {
    origin: request.headers.get('Origin'),
    clientKey: resolveClientKey(request),
    hasSessionToken: !!(extractSessionToken(request)),
    userAgent: request.headers.get('User-Agent')?.substring(0, 50),
  });

  // ── 1. Parse JSON body ──────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    console.warn('[streaming] Invalid JSON body');
    throw new ValidationError('Invalid JSON body');
  }

  const userMessage = body.message;
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    console.warn('[streaming] Message validation failed: empty or invalid');
    throw new ValidationError('Message is required');
  }

  // ── 2. Resolve client config & key ──────────────────────────────────────
  const clientConfig = getClientConfig(request);
  let clientKey = resolveClientKey(request);

  console.log('[streaming] Origin validation:', {
    origin,
    clientKey,
    clientName: clientConfig?.name,
  });

  // ── 3. Sanitize user message ────────────────────────────────────────────
  const sanitized = sanitizeInput(userMessage, 2000);
  if (!sanitized) {
    console.warn('[streaming] Message empty after sanitization');
    throw new ValidationError('Message is empty after sanitization');
  }

  // Report injection detections as early-warning (non-blocking)
  const injection = detectInjection(sanitized);
  if (injection.detected) {
    console.warn('[streaming] Prompt injection patterns detected:', injection.patterns.join(', '));
  }

  // ── 4. Session — validate existing or create new ────────────────────────
  let session = null;
  let sessionToken = null;
  let conversationId = null;

  const existingToken = extractSessionToken(request) || body.session;
  if (existingToken) {
    session = await validateSession(existingToken, env);
    if (session) {
      sessionToken = existingToken;
      conversationId = session.conversationId;
      clientKey = session.clientKey;
    }
    console.log('[streaming] Session validation:', {
      hadToken: true,
      validated: !!session,
      conversationId,
      clientKey,
    });
  }

  // ── 5. Turnstile verification (first message only) ─────────────────────
  if (!session) {
    console.log('[streaming] Creating new session (first message):', { clientKey });

    const turnstileToken = await extractTurnstileToken(request);
    if (turnstileToken) {
      const verification = await verifyTurnstile(turnstileToken, env);
      if (!verification.success) {
        console.warn('[streaming] Turnstile verification failed:', verification.error);
        throw new ValidationError(verification.error || 'Turnstile verification failed');
      }
      console.log('[streaming] Turnstile verification: passed');
    } else if (env.TURNSTILE_SECRET_KEY) {
      console.warn('[streaming] No Turnstile token provided — skipping verification');
    }

    session = await createSession(clientKey, env, existingToken || null);
    sessionToken = session.token;
    conversationId = session.conversationId;

    await createConversation(clientKey, sessionToken, env, conversationId);
    console.log('[streaming] Session created:', { clientKey, conversationId });
  }

  // ── 6. Rate limit check ────────────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(request, env);
  console.log('[streaming] Rate limit check:', {
    allowed: rateLimitResult.allowed,
    retryAfter: rateLimitResult.retryAfter,
  });
  if (!rateLimitResult.allowed) {
    console.warn('[streaming] Rate limit exceeded:', rateLimitResult);
    throw new ChatError(
      `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter || 60} seconds.`,
      429,
      'RATE_LIMIT_ERROR',
    );
  }

  // ── 7. AI budget check ─────────────────────────────────────────────────
  try {
    await checkBudget(clientKey, env);
    console.log('[streaming] Budget check: passed');
  } catch (err) {
    console.warn('[streaming] Budget check failed:', err.message);
    throw err;
  }

  // ── 8. Append user message to D1 ───────────────────────────────────────
  await appendMessage(conversationId, 'user', sanitized, null, null, env);
  console.log('[streaming] User message appended to D1:', { conversationId, length: sanitized.length });

  // ── 9. Increment rate limit and session counters ───────────────────────
  const ip = extractIP(request);
  ctx.waitUntil(incRateLimitCount(ip, env).catch(err => {
    console.warn('[streaming] Rate limit increment failed:', err.message);
  }));
  ctx.waitUntil(incrementMessageCount(sessionToken, env).catch(err => {
    console.warn('[streaming] Session message count increment failed:', err.message);
  }));

  // ── 10. Load full message history for AI context ───────────────────────
  const { messages: history } = await getConversation(conversationId, env);
  const aiMessages = history.map(m => ({ role: m.role, content: m.content }));
  console.log('[streaming] AI call initiation:', {
    conversationId,
    historyCount: aiMessages.length,
    clientKey,
    model: clientConfig?.chat?.model,
  });

  // ── 11. Call streamAIResponse — returns SSE ReadableStream ─────────────
  const aiStream = await streamAIResponse(aiMessages, clientKey, clientConfig, env, ctx);

  // ── 12. Build wrapper stream — emit conversationId header + forward ────
  let assistantText = '';
  const encoder = new TextEncoder();

  const wrappedStream = new ReadableStream({
    async start(controller) {
      // Emit the initial conversationId event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ conversationId, role: 'assistant' })}\n\n`),
      );

      const reader = aiStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        let tokenCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Forward to client
          controller.enqueue(value);

          // Accumulate text by parsing SSE data lines
          buffer += decoder.decode(value, { stream: true });
          tokenCount++;

          // Process complete lines
          while (buffer.includes('\n')) {
            const nlIdx = buffer.indexOf('\n');
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);

            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;

              try {
                const parsed = JSON.parse(payload);
                // Only accumulate actual content — skip error events
                if (parsed.content && !parsed.error) {
                  assistantText += parsed.content;
                }
              } catch {
                // Non-JSON data — skip accumulation
              }
            }
          }
        }

        // Flush any remaining content in buffer
        if (buffer.trim().startsWith('data: ')) {
          const payload = buffer.trim().slice(6).trim();
          if (payload !== '[DONE]') {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content && !parsed.error) {
                assistantText += parsed.content;
              }
            } catch {
              // skip
            }
          }
        }

        console.log('[streaming] Stream completed:', {
          conversationId,
          tokenChunks: tokenCount,
          assistantTextLength: assistantText.length,
        });

        // ── Persist assistant message via ctx.waitUntil (non-blocking) ──
        if (assistantText) {
          ctx.waitUntil(
            appendMessage(conversationId, 'assistant', assistantText, null, null, env)
              .catch(err => console.error('[streaming] Failed to persist assistant message:', err.message)),
          );
        }

        controller.close();
      } catch (err) {
        console.error('[streaming] Stream wrapper error:', {
          error: err.message,
          conversationId,
          assistantTextLength: assistantText.length,
        });
        // Save any partial text we've accumulated
        if (assistantText) {
          ctx.waitUntil(
            appendMessage(conversationId, 'assistant', assistantText, null, null, env)
              .catch(e => console.error('[streaming] Failed to persist partial message:', e.message)),
          );
        }
        controller.error(err);
      }
    },

    cancel() {
      aiStream.cancel().catch(() => {});
    },
  });

  // ── 13. Return SSE response ────────────────────────────────────────────
  return new Response(wrappedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'X-Session-Token': sessionToken,
      ...SECURITY_HEADERS,
      ...CORS_HEADERS,
    },
  });
}
