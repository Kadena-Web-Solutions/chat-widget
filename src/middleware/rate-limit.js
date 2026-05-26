/**
 * Rate Limiting Middleware
 *
 * Wraps the security/rate-limit.js module into middleware-compatible functions
 * that extract IP, resolve client identity from Origin, and produce standard
 * rate limit response headers.
 *
 * Imported by route handlers (e.g., POST /api/chat) to enforce rate limits
 * before processing messages.
 */

import { getClientConfig } from '../config.js';
import {
  checkRateLimit as _checkRateLimit,
  getRateLimitStatus as _getRateLimitStatus,
} from '../security/rate-limit.js';

// ─── IP Extraction ─────────────────────────────────────────────────────────────

/**
 * Extract the client IP from request headers.
 * Uses CF-Connecting-IP (Cloudflare proxy) first, falls back to X-Forwarded-For.
 *
 * @param {Request} request - Incoming HTTP request
 * @returns {string} Client IP address, or 'unknown' if not found
 */
function extractIP(request) {
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP.trim();

  const xff = request.headers.get('X-Forwarded-For');
  if (xff) {
    // X-Forwarded-For may contain multiple IPs; take the first (client)
    return xff.split(',')[0].trim();
  }

  return 'unknown';
}

// ─── Middleware Functions ──────────────────────────────────────────────────────

/**
 * Check rate limits for the incoming request.
 * Extracts IP and clientKey, then delegates to the security module.
 *
 * @param {Request} request - Incoming HTTP request
 * @param {Object} env - Worker bindings (CHAT_RATE_LIMIT must be available)
 * @returns {Promise<{
 *   allowed: boolean,
 *   retryAfter?: number,
 *   limit: { messages: number, conversations: number }
 * }>}
 */
export async function checkRateLimit(request, env) {
  const ip = extractIP(request);
  const clientConfig = getClientConfig(request);
  const clientKey = clientConfig?.name || 'default';

  return _checkRateLimit(ip, clientKey, env);
}

/**
 * Build rate limit response headers from the current status.
 * Returns headers suitable for merging into a Response, e.g.:
 *   { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '15', ... }
 *
 * @param {Request} request - Incoming HTTP request
 * @param {Object} env - Worker bindings
 * @returns {Promise<Record<string, string>>} Headers object
 */
export async function getRateLimitHeaders(request, env) {
  const ip = extractIP(request);
  const status = await _getRateLimitStatus(ip, env);

  const now = Date.now();
  const msgRemaining = Math.max(0, status.messages.limit - status.messages.count);
  const msgResetSec = Math.max(0, Math.ceil((status.messages.resetAt - now) / 1000));

  return {
    'X-RateLimit-Limit': String(status.messages.limit),
    'X-RateLimit-Remaining': String(msgRemaining),
    'X-RateLimit-Reset': String(msgResetSec),
    'X-RateLimit-Conversation-Limit': String(status.conversations.limit),
    'X-RateLimit-Conversation-Remaining': String(Math.max(0, status.conversations.limit - status.conversations.count)),
  };
}
