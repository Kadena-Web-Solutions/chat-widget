/**
 * Custom error classes for the Chat Widget Worker.
 *
 * Each error carries:
 *   - statusCode: HTTP status code
 *   - code:        machine-readable error code (e.g. 'VALIDATION_ERROR')
 *   - message:     human-readable error message
 *
 * The errorResponse() factory converts any error into a proper JSON Response
 * with correct status code and security headers.
 */

import { SECURITY_HEADERS } from './middleware/cors.js';

// ─── Base ─────────────────────────────────────────────────────────────────────

export class ChatError extends Error {
  /**
   * @param {string} message - Human-readable message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'ChatError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ─── Specific Errors ──────────────────────────────────────────────────────────

export class ValidationError extends ChatError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ChatError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends ChatError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends ChatError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class InternalError extends ChatError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
    this.name = 'InternalError';
  }
}

// ─── Response Factory ─────────────────────────────────────────────────────────

/**
 * Convert any error (ChatError or generic Error) into a proper JSON Response.
 * ChatError instances use their own statusCode/code; generic errors become 500.
 *
 * @param {Error} error
 * @param {string} [allowedOrigin] - CORS origin header value
 * @returns {Response}
 */
export function errorResponse(error, allowedOrigin) {
  const isChatError = error instanceof ChatError;

  const statusCode = isChatError ? error.statusCode : 500;
  const code = isChatError ? error.code : 'INTERNAL_ERROR';
  const message = error.message || 'An unexpected error occurred';

  // Log full error details server-side for non-user-facing errors
  if (!isChatError || statusCode >= 500) {
    console.error(`💥 [${code}] ${message}`, error.stack || error);
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store',
    ...SECURITY_HEADERS,
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return new Response(JSON.stringify({ error: { code, message } }), {
    status: statusCode,
    headers,
  });
}
