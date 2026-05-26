/**
 * Input Sanitization & Validation Module
 *
 * Provides defense-in-depth input processing for the Chat Widget Worker.
 * All user-supplied data passes through these functions before storage or AI routing.
 *
 * Design principles:
 *   - Strip all HTML (not just script tags) — regex-based for zero-dependency operation
 *   - Validate roles, lengths, formats before any downstream processing
 *   - Detect prompt injection patterns as an early warning layer
 *   - Return structured results ({ valid, sanitized }) for programmatic handling
 */

// ─── HTML Sanitization ─────────────────────────────────────────────────────────

const HTML_STRIP_REGEX = /<[^>]*>/g;

/**
 * Strip all HTML tags, trim whitespace, and truncate to maxLength.
 *
 * @param {string} input - Raw user input
 * @param {number} [maxLength=2000] - Maximum allowed length after sanitization
 * @returns {string} Sanitized string (empty string for null/undefined/non-string input)
 */
export function sanitizeInput(input, maxLength = 2000) {
  if (input == null || typeof input !== 'string') {
    return '';
  }

  const stripped = input.replace(HTML_STRIP_REGEX, '').trim();
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped;
}

// ─── Message Sanitization ──────────────────────────────────────────────────────

const VALID_ROLES = new Set(['user', 'assistant', 'system']);

/**
 * Sanitize an entire message object (content + role validation).
 *
 * @param {Object} message - Message object with { content, role }
 * @param {string} message.content - Message text content
 * @param {string} message.role - Message role ('user' | 'assistant' | 'system')
 * @returns {Object} Sanitized message object with clean content and validated role
 */
export function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') {
    return { content: '', role: 'user' };
  }

  const content = sanitizeInput(message.content, 2000);
  const role = VALID_ROLES.has(message.role) ? message.role : 'user';

  return { ...message, content, role };
}

// ─── Injection Detection ───────────────────────────────────────────────────────

/**
 * Patterns that indicate potential system prompt injection attempts.
 * Case-insensitive matching for all patterns.
 */
const INJECTION_PATTERNS = [
  // Direct instruction override
  { pattern: /ignore\s+(all\s+)?(previous|prior|earlier|above)\s+(instructions?|directives?|prompts?|commands?)/i, label: 'ignore-previous-instructions' },
  // Identity hijacking
  { pattern: /you\s+are\s+(now|acting\s+as)\s+/i, label: 'identity-hijack' },
  // Role prefix injection
  { pattern: /(?:^|\n)(?:system|assistant)\s*:/i, label: 'role-prefix-injection' },
  // Roleplay coercion
  { pattern: /\b(?:act\s+as|pretend|roleplay|imagine\s+you\s+are)\b/i, label: 'roleplay-coercion' },
  // Newline-prefixed instruction injection
  { pattern: /\n\s*(?:you\s+(?:must|should|will|shall|need\s+to)|do\s+not\s+|never\s+|always\s+)/i, label: 'newline-instruction' },
  // DAN / jailbreak variants
  { pattern: /\b(?:DAN|developer\s+mode|jailbreak)\b/i, label: 'jailbreak-attempt' },
  // Prompt leakage attempts
  { pattern: /(?:what|tell\s+me|show|reveal|print|output)\s+(?:your|the)\s+(?:instructions?|prompts?|system\s+prompt)/i, label: 'prompt-leakage' },
  // Context boundary override
  { pattern: /\b(?:new\s+instructions?|override|disregard|forget\s+everything)\b/i, label: 'context-override' },
];

/**
 * Detect potential prompt injection patterns in user input.
 * Returns detected patterns as early-warning signal (does NOT block on its own).
 *
 * @param {string} input - User input to scan
 * @returns {{ detected: boolean, patterns: string[] }}
 */
export function detectInjection(input) {
  if (!input || typeof input !== 'string') {
    return { detected: false, patterns: [] };
  }

  const detected = INJECTION_PATTERNS
    .filter(({ pattern }) => pattern.test(input))
    .map(({ label }) => label);

  return {
    detected: detected.length > 0,
    patterns: detected,
  };
}

// ─── Client Key Validation ─────────────────────────────────────────────────────

const CLIENT_KEY_REGEX = /^[a-z0-9.-]+$/;
const CLIENT_KEY_MAX_LENGTH = 100;

/**
 * Validate and sanitize a client key.
 * Client keys must be lowercase letters, numbers, dots, and hyphens only.
 *
 * @param {string} key - Raw client key
 * @returns {{ valid: boolean, sanitized: string }}
 */
export function validateClientKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, sanitized: '' };
  }

  const sanitized = key.trim().toLowerCase();

  if (sanitized.length === 0 || sanitized.length > CLIENT_KEY_MAX_LENGTH) {
    return { valid: false, sanitized: sanitized.slice(0, CLIENT_KEY_MAX_LENGTH) };
  }

  return {
    valid: CLIENT_KEY_REGEX.test(sanitized),
    sanitized,
  };
}

// ─── Email Validation ──────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and sanitize an email address.
 *
 * @param {string} email - Raw email string
 * @returns {{ valid: boolean, sanitized: string }}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, sanitized: '' };
  }

  const sanitized = email.trim().toLowerCase();

  if (sanitized.length === 0) {
    return { valid: false, sanitized: '' };
  }

  return {
    valid: EMAIL_REGEX.test(sanitized),
    sanitized,
  };
}

// ─── Phone Validation ──────────────────────────────────────────────────────────

/**
 * Validate and sanitize a phone number.
 * Strips all non-digit characters, then validates 7-15 digit length.
 *
 * @param {string} phone - Raw phone string
 * @returns {{ valid: boolean, sanitized: string }}
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, sanitized: '' };
  }

  const sanitized = phone.replace(/\D/g, '');

  return {
    valid: sanitized.length >= 7 && sanitized.length <= 15,
    sanitized,
  };
}
