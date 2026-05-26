/**
 * CORS middleware for the Chat Widget Worker.
 *
 * Follows the contact-form pattern at /data/workspace/contact-form/src/utils.js.
 * Uses CHAT_CLIENTS from config.js for origin validation.
 * Falls back to safe defaults if CHAT_CLIENTS is not yet configured (T13).
 */

// ─── Try to import CHAT_CLIENTS; use fallback if T13 hasn't run yet ───────────
let _chatClients = null;

async function getChatClients() {
  if (_chatClients) return _chatClients;
  try {
    const config = await import('../config.js');
    // config might export CHAT_CLIENTS (new pattern) or default (old placeholder)
    _chatClients = config.CHAT_CLIENTS || config.default || {};
  } catch {
    // Fallback: allow development origins
    _chatClients = {
      _default: {
        name: 'Chat Widget Default',
        allowedOrigins: [
          'kadenaweb.solutions',
          'www.kadenaweb.solutions',
          'chat-widget.kadenaweb.solutions',
          'localhost',
          '127.0.0.1',
        ],
      },
    };
  }
  return _chatClients;
}

// ─── CORS Headers ─────────────────────────────────────────────────────────────

export const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
};

// Workers bypass _headers files — security headers MUST be set in code
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ─── Origin Validation ────────────────────────────────────────────────────────

/**
 * Validate the request Origin against allowed client origins.
 *
 * Iterates over all CHAT_CLIENTS entries, checking if the request's Origin
 * hostname matches any entry's allowedOrigins. Returns the validated origin
 * string, or a safe default fallback.
 *
 * @param {Request} request
 * @returns {Promise<string>} validated origin URL string
 */
export async function validateOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return 'https://kadenaweb.solutions';

  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return 'https://kadenaweb.solutions';
  }

  const clients = await getChatClients();

  for (const [_key, config] of Object.entries(clients)) {
    if (!config.allowedOrigins) continue;
    if (config.allowedOrigins.includes(hostname)) {
      return origin;
    }
    // Subdomain matching: allow any subdomain prefix on allowedOrigins entries
    // e.g., "redesign.kadena-web-solutions.pages.dev" matches "kadena-web-solutions.pages.dev"
    for (const allowed of config.allowedOrigins) {
      if (hostname.endsWith('.' + allowed)) {
        return origin;
      }
    }
  }

  // Origin not recognized — fall back to default
  return 'https://kadenaweb.solutions';
}

// ─── Response Builders ────────────────────────────────────────────────────────

/**
 * Build a CORS-aware JSON response.
 * Follows contact-form corsResponse() pattern.
 *
 * @param {*} body - Response body (object or string)
 * @param {number} status - HTTP status code
 * @param {string} allowedOrigin - Validated origin from validateOrigin()
 * @param {Object} [extraHeaders] - Additional headers to merge
 * @returns {Response}
 */
export function corsResponse(body, status, allowedOrigin, extraHeaders = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

/**
 * Handle CORS preflight (OPTIONS) request.
 * Returns proper Access-Control headers so browsers allow the actual request.
 *
 * @param {string} allowedOrigin - Validated origin from validateOrigin()
 * @returns {Response}
 */
export function handlePreflight(allowedOrigin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
    },
  });
}
