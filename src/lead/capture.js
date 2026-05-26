/**
 * Lead Capture Module — D1 CRUD for chat widget leads
 *
 * Provides lead creation, conversation-based lead extraction, scoring, and
 * email-based duplicate detection. All D1 queries use parameterized `?`
 * placeholders — zero string interpolation.
 *
 * D1 binding: env.DB
 * Errors:    thrown as ChatError subclasses from ../errors.js
 */

import { ChatError, ValidationError, NotFoundError, InternalError } from '../errors.js';
import {
  sanitizeInput,
  validateEmail,
  validatePhone,
} from '../security/sanitize.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Normalise a D1 lead row from snake_case to camelCase.
 * @param {Object} row
 * @returns {Object}
 */
function formatLead(row) {
  if (!row) return null;
  return {
    id:             row.id,
    conversationId: row.conversation_id,
    clientKey:      row.client_key,
    name:           row.name,
    email:          row.email,
    phone:          row.phone,
    message:        row.message,
    leadScore:      row.lead_score,
    leadSource:     row.lead_source,
    status:         row.status,
    enrichedData:   row.enriched_data
      ? (typeof row.enriched_data === 'string' ? JSON.parse(row.enriched_data) : row.enriched_data)
      : null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

// ─── Lead Creation ────────────────────────────────────────────────────────────

/**
 * Insert a new lead into the D1 `leads` table.
 *
 * Validates required fields (email is mandatory), sanitises all string inputs,
 * and generates a UUID for the lead ID. Throws a ValidationError if email is
 * missing or invalid.
 *
 * @param {Object}  data
 * @param {string}  data.conversationId — Foreign key into `conversations`
 * @param {string}  data.clientKey      — Foreign key into `clients`
 * @param {string}  data.email          — Lead email address (required)
 * @param {string}  [data.name]         — Lead name (optional)
 * @param {string}  [data.phone]        — Lead phone number (optional)
 * @param {string}  [data.message]      — Lead message/summary (optional)
 * @param {string}  [data.source]       — Lead source (defaults to 'chat')
 * @param {Object}  env                 — Worker env with `DB` binding
 * @returns {Promise<{ success: boolean, leadId: string }>}
 * @throws {ValidationError} If email is missing or invalid
 * @throws {InternalError}   On D1 write failure
 */
export async function createLead(data, env) {
  try {
    // ── Validate email (required) ──────────────────────────────────────────
    const emailResult = validateEmail(data.email);
    if (!data.email || !emailResult.valid) {
      throw new ValidationError('A valid email address is required');
    }

    // ── Validate & sanitise optional fields ────────────────────────────────
    const name    = data.name ? sanitizeInput(data.name, 200) : null;
    const message = data.message ? sanitizeInput(data.message, 5000) : null;

    let phone = null;
    if (data.phone) {
      const phoneResult = validatePhone(data.phone);
      if (phoneResult.valid) {
        phone = phoneResult.sanitized;
      }
      // Non-valid phone is silently dropped — we don't block the lead
    }

    const id        = generateId();
    const timestamp = now();
    const source    = data.source || 'chat';

    await env.DB.prepare(
      `INSERT INTO leads
         (id, conversation_id, client_key, name, email, phone, message,
          lead_score, lead_source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'new', ?, ?)`
    )
      .bind(
        id,
        data.conversationId,
        data.clientKey,
        name,
        emailResult.sanitized,
        phone,
        message,
        source,
        timestamp,
        timestamp,
      )
      .run();

    return { success: true, leadId: id };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to create lead: ${error.message}`);
  }
}

// ─── Conversation-Based Lead Extraction ───────────────────────────────────────

/**
 * Extract a structured lead object from conversation messages.
 *
 * This function enriches explicit form data with supplementary information
 * gleaned from the conversation context. It does NOT replace the explicit
 * HTML form — it finds patterns that the user mentioned organically during
 * the chat (e.g. "my name is John", "you can reach me at 555-1234").
 *
 * @param {string}  conversationId — The conversation UUID
 * @param {Object[]} messages       — Array of message objects (role, content)
 * @param {Object}  clientConfig    — Client configuration from CHAT_CLIENTS
 * @returns {Object} { name, email, phone, message, summary }
 */
export function extractLeadFromConversation(conversationId, messages, clientConfig) {
  const result = {
    name:    null,
    email:   null,
    phone:   null,
    message: null,
    summary: '',
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return result;
  }

  // Only scan user messages (skip assistant/system)
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  if (userMessages.length === 0) return result;

  const allText = userMessages.join('\n');

  // ── Name extraction patterns ────────────────────────────────────────────
  const namePatterns = [
    /(?:my name is|i'm|i am|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  for (const pattern of namePatterns) {
    const match = allText.match(pattern);
    if (match) {
      result.name = sanitizeInput(match[1], 200);
      break;
    }
  }

  // ── Email extraction patterns ───────────────────────────────────────────
  const emailPatterns = [
    /(?:email|mail|e-?mail)[:\s]*([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /(?:reach me at|contact me at|message me at|send to)\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /(?:my email is|email is)\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
  ];

  for (const pattern of emailPatterns) {
    const match = allText.match(pattern);
    if (match) {
      const emailResult = validateEmail(match[1]);
      if (emailResult.valid) {
        result.email = emailResult.sanitized;
        break;
      }
    }
  }

  // ── Phone extraction patterns ───────────────────────────────────────────
  const phonePatterns = [
    /(?:phone|call|number|reach|contact)[:\s]*(\+?[\d\s()\-.]{7,20})/i,
    /(?:my number is|my phone is|phone is)\s+(\+?[\d\s()\-.]{7,20})/i,
    /(?:call me at|reach me at)\s+(\+?[\d\s()\-.]{7,20})/i,
  ];

  for (const pattern of phonePatterns) {
    const match = allText.match(pattern);
    if (match) {
      const phoneResult = validatePhone(match[1]);
      if (phoneResult.valid) {
        result.phone = phoneResult.sanitized;
        break;
      }
    }
  }

  // ── Message / summary — use the full user conversation ──────────────────
  const combined = userMessages.join(' | ');
  result.message = sanitizeInput(combined, 5000);

  // Build a concise summary of what was discussed
  const topicKeywords = [
    clientConfig?.name,
    ...(clientConfig?.chat?.escalationKeywords || []),
  ].filter(Boolean);

  const mentionedTopics = topicKeywords.filter(kw =>
    combined.toLowerCase().includes(kw.toLowerCase())
  );

  result.summary = mentionedTopics.length > 0
    ? `Lead discussed: ${mentionedTopics.join(', ')}`
    : `Lead from chat conversation ${conversationId}`;

  return result;
}

// ─── Lead Scoring ─────────────────────────────────────────────────────────────

/**
 * Calculate a lead score based on data completeness and conversation signals.
 *
 * Scoring model:
 *   Base: 50
 *   +10  — email provided
 *   +10  — phone provided
 *   +10  — name provided
 *   +5   — per message in conversation (max +20)
 *   +10  — escalation keyword detected
 *   +15  — specific service/business mentioned
 *
 * Score is capped at 100 and floored at 0.
 *
 * @param {Object} lead          — { name, email, phone, message }
 * @param {Object} [clientConfig] — CHAT_CLIENTS entry (for escalation keywords)
 * @param {number} [messageCount] — Number of messages in conversation
 * @returns {number} Integer 0–100
 */
export function scoreLead(lead, clientConfig, messageCount = 0) {
  let score = 50;

  // Data completeness bonuses
  if (lead.email && lead.email.length > 0) {
    score += 10;
  }

  if (lead.phone && lead.phone.length > 0) {
    score += 10;
  }

  if (lead.name && lead.name.length > 0) {
    score += 10;
  }

  // Message volume bonus (5 pts per message, cap +20)
  const messageBonus = Math.min(messageCount * 5, 20);
  score += messageBonus;

  // Escalation keyword detection
  if (clientConfig?.chat?.escalationKeywords && lead.message) {
    const text = (lead.message || '').toLowerCase();
    const matched = clientConfig.chat.escalationKeywords.some(keyword =>
      text.includes(keyword.toLowerCase())
    );
    if (matched) {
      score += 10;
    }
  }

  // Service/business mention bonus
  if (clientConfig?.name && lead.message) {
    const text = (lead.message || '').toLowerCase();
    if (text.includes(clientConfig.name.toLowerCase())) {
      score += 15;
    }
  }

  // Clamp to 0–100
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Lead Lookup ───────────────────────────────────────────────────────────────

/**
 * Look up an existing lead by email and client key.
 *
 * Used for duplicate detection — if a user with the same email has already
 * submitted a lead for the same client, return the existing record instead
 * of creating a duplicate.
 *
 * @param {string} email     — Lead email address
 * @param {string} clientKey — Client identifier
 * @param {Object} env       — Worker env with `DB` binding
 * @returns {Promise<Object|null>} Lead object (camelCase) or null
 * @throws {InternalError} On D1 read failure
 */
export async function getLeadByEmail(email, clientKey, env) {
  try {
    const emailResult = validateEmail(email);
    if (!emailResult.valid) return null;

    const row = await env.DB.prepare(
      `SELECT id, conversation_id, client_key, name, email, phone,
              message, lead_score, lead_source, status, enriched_data,
              created_at, updated_at
       FROM leads
       WHERE email = ? AND client_key = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(emailResult.sanitized, clientKey)
      .first();

    return row ? formatLead(row) : null;
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to look up lead by email: ${error.message}`);
  }
}
