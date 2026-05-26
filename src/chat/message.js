/**
 * Message Storage — D1 CRUD for chat messages
 *
 * All queries use parameterized `?` placeholders (zero string interpolation).
 * D1 binding: env.DB
 * Errors: thrown as ChatError subclasses from ../errors.js
 */

import { ChatError, NotFoundError, InternalError } from '../errors.js';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

export async function saveMessage(conversationId, role, content, env) {
  try {
    const id = generateId();
    const timestamp = now();

    await env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, conversationId, role, content, timestamp)
      .run();

    return {
      id,
      conversationId,
      role,
      content,
      created_at: timestamp,
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to save message: ${error.message}`);
  }
}

export async function getMessages(conversationId, limit, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
      .bind(conversationId, limit || 50)
      .all();

    return results.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    }));
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to get messages: ${error.message}`);
  }
}

export async function getMessageById(messageId, env) {
  try {
    const row = await env.DB.prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE id = ?`
    )
      .bind(messageId)
      .first();

    if (!row) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to get message: ${error.message}`);
  }
}
