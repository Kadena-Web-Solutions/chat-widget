/**
 * Security Headers — HTTP security header management
 *
 * Workers bypass _headers files; security headers MUST be set in code.
 * Follows the contact-form pattern at /data/workspace/contact-form/src/utils.js.
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-XSS-Protection': '1; mode=block',
};

const CORS_HEADERS_BASE = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
};

export function addSecurityHeaders(response) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function getSecurityHeaders() {
  return { ...SECURITY_HEADERS };
}

export function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    ...CORS_HEADERS_BASE,
  };
}
