/**
 * Chat History — D1 conversation history retrieval
 *
 * All queries use parameterized `?` placeholders (zero string interpolation).
 * D1 binding: env.DB
 * Errors: thrown as ChatError subclasses from ../errors.js
 */

import { ChatError, NotFoundError, InternalError } from '../errors.js';

export async function getConversationHistory(conversationId, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
      .bind(conversationId)
      .all();

    return results.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    }));
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new InternalError(`Failed to get conversation history: ${error.message}`);
  }
}
