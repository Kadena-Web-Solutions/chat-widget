/**
 * Bearer Token Authentication Middleware
 *
 * Verifies `Authorization: Bearer <token>` headers against the
 * `env.ADMIN_TOKEN` secret for admin/metrics endpoints.
 *
 * Extracted from the inline function in index.js for reuse across
 * the codebase.
 */

/**
 * Verify a Bearer token against the configured admin secret.
 *
 * Reads the `Authorization` header, extracts the token after the
 * `Bearer ` prefix, and compares it with `env.ADMIN_TOKEN`.
 *
 * @param {Request} request — Incoming HTTP request
 * @param {Object}  env     — Worker env containing `ADMIN_TOKEN` secret
 * @returns {boolean} True if the token is valid, false otherwise
 */
export function verifyBearerToken(request, env) {
  if (!env.ADMIN_TOKEN) return false;

  const auth = request.headers.get('Authorization');
  if (!auth) return false;

  // Case-insensitive prefix check (RFC 7235 §2.1)
  if (!auth.startsWith('Bearer ') && !auth.startsWith('bearer ')) return false;

  const token = auth.slice(7);
  return token === env.ADMIN_TOKEN;
}
