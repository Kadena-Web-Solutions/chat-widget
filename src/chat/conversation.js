/**
 * Conversation Manager — D1 CRUD
 *
 * Full create/read/update/list operations for conversations and messages.
 * ALL queries use parameterized `?` placeholders (zero string interpolation).
 *
 * D1 binding: env.DB
 * Errors:    thrown as ChatError subclasses from ../errors.js
 */

import { ChatError, NotFoundError, InternalError } from '../errors.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Normalise a D1 conversation row from snake_case to camelCase.
 * @param {Object} row
 * @returns {Object}
 */
function formatConversation(row) {
  return {
    id:             row.id,
    clientKey:      row.client_key,
    sessionToken:   row.session_token,
    status:         row.status,
    source:         row.source,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    leadId:         row.lead_id,
    metadata:       row.metadata
      ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
      : null,
  };
}

/**
 * Normalise a D1 message row from snake_case to camelCase.
 * @param {Object} row
 * @returns {Object}
 */
function formatMessage(row) {
  return {
    id:             row.id,
    conversationId: row.conversation_id,
    role:           row.role,
    content:        row.content,
    model:          row.model,
    tokenCount:     row.token_count,
    createdAt:      row.created_at,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new conversation.
 *
 * @param {string}  clientKey    — Foreign key into `clients` table
 * @param {string}  sessionToken — Per-client session token
 * @param {Object}  env          — Worker env with `DB` binding
 * @returns {Promise<Object>} Created conversation row (camelCase)
 */
export async function createConversation(clientKey, sessionToken, env, conversationId) {
  try {
    const id        = conversationId || generateId();
    const timestamp = now();

    await env.DB.prepare(
      `INSERT INTO conversations
         (id, client_key, session_token, status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'web', ?, ?)`
    )
      .bind(id, clientKey, sessionToken, timestamp, timestamp)
      .run();

    return {
      id,
      clientKey,
      sessionToken,
      status:      'active',
      source:      'web',
      createdAt:   timestamp,
      updatedAt:   timestamp,
      leadId:      null,
      metadata:    null,
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to create conversation: ${error.message}`);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get a conversation by ID, including all messages ordered by created_at ASC.
 *
 * @param {string}  conversationId
 * @param {Object}  env — Worker env with `DB` binding
 * @returns {Promise<{ conversation: Object, messages: Object[] }>}
 */
export async function getConversation(conversationId, env) {
  try {
    const conversation = await env.DB.prepare(
      `SELECT id, client_key, session_token, status, source,
              created_at, updated_at, lead_id, metadata
       FROM conversations
       WHERE id = ?`
    )
      .bind(conversationId)
      .first();

    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found`);
    }

    const { results: messages } = await env.DB.prepare(
      `SELECT id, conversation_id, role, content, model, token_count, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
      .bind(conversationId)
      .all();

    return {
      conversation: formatConversation(conversation),
      messages:     messages.map(formatMessage),
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to get conversation: ${error.message}`);
  }
}

// ─── Append Message ───────────────────────────────────────────────────────────

/**
 * Append a message to a conversation.
 *
 * Also updates the conversation's `updated_at` timestamp. Both operations
 * run inside a D1 batch for atomicity.
 *
 * @param {string}  conversationId
 * @param {string}  role          — 'user' | 'assistant' | 'system'
 * @param {string}  content       — Message body text
 * @param {string}  [model]       — AI model identifier (optional)
 * @param {number}  [tokenCount]  — Token count for the message (optional)
 * @param {Object}  env           — Worker env with `DB` binding
 * @returns {Promise<Object>} Created message row (camelCase)
 */
export async function appendMessage(
  conversationId,
  role,
  content,
  model,
  tokenCount,
  env,
) {
  try {
    const id        = generateId();
    const timestamp = now();

    // Atomic batch: insert message + bump conversation timestamp
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages
           (id, conversation_id, role, content, model, token_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, conversationId, role, content, model || null, tokenCount || null, timestamp),

      env.DB.prepare(
        `UPDATE conversations
         SET updated_at = ?
         WHERE id = ?`
      ).bind(timestamp, conversationId),
    ]);

    return {
      id,
      conversationId,
      role,
      content,
      model:      model || null,
      tokenCount: tokenCount || null,
      createdAt:  timestamp,
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to append message: ${error.message}`);
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List conversations for a client, with optional filtering and pagination.
 *
 * @param {string}  clientKey
 * @param {Object}  [options]     — { status?, limit?, offset? }
 * @param {string}  [options.status] — Filter by conversation status
 * @param {number}  [options.limit]  — Page size (default 20)
 * @param {number}  [options.offset] — Pagination offset (default 0)
 * @param {Object}  env           — Worker env with `DB` binding
 * @returns {Promise<{ conversations: Object[], total: number, hasMore: boolean }>}
 */
export async function listConversations(clientKey, options, env) {
  try {
    const limit  = options?.limit  ?? 20;
    const offset = options?.offset ?? 0;
    const status = options?.status;

    // ── Total count & page — two query paths (no string interpolation) ───
    let countResult;
    let results;

    if (status) {
      countResult = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM conversations
         WHERE client_key = ? AND status = ?`
      )
        .bind(clientKey, status)
        .first();

      const r = await env.DB.prepare(
        `SELECT id, client_key, session_token, status, source,
                created_at, updated_at, lead_id, metadata
         FROM conversations
         WHERE client_key = ? AND status = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
        .bind(clientKey, status, limit, offset)
        .all();

      results = r.results;
    } else {
      countResult = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM conversations
         WHERE client_key = ?`
      )
        .bind(clientKey)
        .first();

      const r = await env.DB.prepare(
        `SELECT id, client_key, session_token, status, source,
                created_at, updated_at, lead_id, metadata
         FROM conversations
         WHERE client_key = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
        .bind(clientKey, limit, offset)
        .all();

      results = r.results;
    }

    const total = countResult ? countResult.total : 0;

    return {
      conversations: results.map(formatConversation),
      total,
      hasMore:       offset + limit < total,
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to list conversations: ${error.message}`);
  }
}

// ─── Status Transitions ───────────────────────────────────────────────────────

/**
 * Update a conversation's status.
 *
 * Verifies the conversation exists first, then performs the update.
 *
 * @param {string}  conversationId
 * @param {string}  status         — New status value
 * @param {Object}  env            — Worker env with `DB` binding
 * @returns {Promise<Object>} { id, status, updatedAt }
 */
async function updateConversationStatus(conversationId, status, env) {
  try {
    // Guard: verify conversation exists before attempting update
    const exists = await env.DB.prepare(
      `SELECT id FROM conversations WHERE id = ?`
    )
      .bind(conversationId)
      .first();

    if (!exists) {
      throw new NotFoundError(`Conversation ${conversationId} not found`);
    }

    const timestamp = now();

    await env.DB.prepare(
      `UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?`
    )
      .bind(status, timestamp, conversationId)
      .run();

    return { id: conversationId, status, updatedAt: timestamp };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to update conversation status: ${error.message}`);
  }
}

/**
 * Mark a conversation as completed.
 *
 * @param {string}  conversationId
 * @param {Object}  env
 * @returns {Promise<Object>} { id, status, updatedAt }
 */
export async function completeConversation(conversationId, env) {
  return updateConversationStatus(conversationId, 'completed', env);
}

/**
 * Mark a conversation as escalated.
 *
 * @param {string}  conversationId
 * @param {Object}  env
 * @returns {Promise<Object>} { id, status, updatedAt }
 */
export async function escalateConversation(conversationId, env) {
  return updateConversationStatus(conversationId, 'escalated', env);
}

/**
 * Mark a conversation as expired.
 *
 * @param {string}  conversationId
 * @param {Object}  env
 * @returns {Promise<Object>} { id, status, updatedAt }
 */
export async function expireConversation(conversationId, env) {
  return updateConversationStatus(conversationId, 'expired', env);
}
