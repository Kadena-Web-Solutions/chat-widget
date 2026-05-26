/**
 * Utility Functions — ID generation, timestamps, validation, JSON helpers
 *
 * Pure functions with no D1/KV dependencies. All functions are synchronous
 * except parseJSONBody and getClientIP which operate on a Request.
 */

export function generateId() {
  return crypto.randomUUID();
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function formatTimestamp(ts) {
  if (!ts) return null;
  const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return date.toISOString();
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  return UUID_REGEX.test(sessionId);
}

export function validateMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const trimmed = message.trim();
  return trimmed.length >= 1 && trimmed.length <= 4096;
}

export function sanitizeForJSON(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    const safe = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      try {
        JSON.stringify({ [key]: value });
        safe[key] = value;
      } catch {
        safe[key] = String(value);
      }
    }
    return safe;
  }
}

export async function parseJSONBody(request) {
  try {
    const data = await request.json();
    return { ok: true, data, error: null };
  } catch (error) {
    return { ok: false, data: null, error: error.message };
  }
}

export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}
