/**
 * Session middleware — validates session tokens on incoming requests.
 *
 * Extracts token from X-Session-Token header or ?token= query param,
 * validates against KV-backed session store, and throws ChatError 401
 * when missing/invalid.
 */

import { ChatError } from '../errors.js';
import {
  validateSession,
} from '../chat/session.js';

// ─── Token Extraction ──────────────────────────────────────────────────────────

/**
 * Extract session token from request.
 * Checks X-Session-Token header first, falls back to ?token= query param.
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function extractSessionToken(request) {
  const headerToken = request.headers.get('X-Session-Token');
  if (headerToken) return headerToken;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken;

  return null;
}

// ─── Session Requirement ───────────────────────────────────────────────────────

/**
 * Require a valid session on a request.
 * Throws ChatError 401 when token is missing or session is expired/invalid.
 *
 * @param {Request} request
 * @param {Object} env - Worker bindings
 * @returns {Promise<{token: string, clientKey: string, conversationId: string, createdAt: number, lastActivity: number, messageCount: number}>}
 */
export async function requireSession(request, env) {
  const token = extractSessionToken(request);

  if (!token) {
    throw new ChatError('Session token required', 401, 'AUTHENTICATION_ERROR');
  }

  const session = await validateSession(token, env);

  if (!session) {
    throw new ChatError('Session expired or invalid', 401, 'AUTHENTICATION_ERROR');
  }

  return session;
}
