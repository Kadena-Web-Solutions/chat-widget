/**
 * Chat Session Management — KV-backed session lifecycle.
 *
 * KV key format: session:{uuid-token}
 * TTL: 600 seconds (10 minutes)
 */

// ─── Session Create ─────────────────────────────────────────────────────────────

/**
 * Create a new chat session.
 *
 * @param {string} clientKey - Client identifier
 * @param {Object} env - Worker bindings
 * @returns {Promise<{token: string, clientKey: string, conversationId: string, createdAt: number, lastActivity: number, messageCount: number}>}
 */
export async function createSession(clientKey, env, providedToken = null) {
  const token = providedToken || crypto.randomUUID();
  const now = Date.now();

  const session = {
    clientKey,
    conversationId: crypto.randomUUID(), // unique conversation ID for this session
    createdAt: now,
    lastActivity: now,
    messageCount: 0,
  };

  await env.CHAT_SESSIONS.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: 600,
  });

  return { token, ...session };
}

// ─── Session Validate ───────────────────────────────────────────────────────────

/**
 * Validate a session token and refresh its TTL.
 *
 * @param {string} token - Session UUID token
 * @param {Object} env - Worker bindings
 * @returns {Promise<null|{token: string, clientKey: string, conversationId: string, createdAt: number, lastActivity: number, messageCount: number}>}
 */
export async function validateSession(token, env) {
  const key = `session:${token}`;
  const data = await env.CHAT_SESSIONS.get(key);

  if (!data) {
    return null;
  }

  const session = JSON.parse(data);
  const now = Date.now();

  // Refresh TTL and update lastActivity
  session.lastActivity = now;

  await env.CHAT_SESSIONS.put(key, JSON.stringify(session), {
    expirationTtl: 600,
  });

  return { token, ...session };
}

// ─── Session Expire ─────────────────────────────────────────────────────────────

/**
 * Expire a session — delete from KV and mark conversation as expired in D1.
 *
 * @param {string} token - Session UUID token
 * @param {Object} env - Worker bindings
 */
export async function expireSession(token, env) {
  const key = `session:${token}`;

  // Delete from KV
  await env.CHAT_SESSIONS.delete(key);

  // Mark conversation as expired in D1 if available
  if (env.DB) {
    try {
      const { conversation } = await import('./conversation.js');
      if (conversation && conversation.expireConversation) {
        // Get conversationId from session before deleting
        const data = await env.CHAT_SESSIONS.get(key);
        if (data) {
          const session = JSON.parse(data);
          await conversation.expireConversation(session.conversationId, env);
        }
      }
    } catch (err) {
      // Non-fatal: just log and continue
      console.warn('expireSession: could not expire conversation in D1', err);
    }
  }
}

// ─── Session Refresh ────────────────────────────────────────────────────────────

/**
 * Explicitly refresh a session's TTL and update lastActivity.
 * Called on every message to keep the session alive.
 *
 * @param {string} token - Session UUID token
 * @param {Object} env - Worker bindings
 * @returns {Promise<null|{token: string, clientKey: string, conversationId: string, createdAt: number, lastActivity: number, messageCount: number}>}
 */
export async function refreshSession(token, env) {
  const key = `session:${token}`;
  const data = await env.CHAT_SESSIONS.get(key);

  if (!data) {
    return null;
  }

  const session = JSON.parse(data);
  session.lastActivity = Date.now();

  await env.CHAT_SESSIONS.put(key, JSON.stringify(session), {
    expirationTtl: 600,
  });

  return { token, ...session };
}

// ─── Message Count Increment ────────────────────────────────────────────────────

/**
 * Increment a session's message count and refresh TTL.
 *
 * @param {string} token - Session UUID token
 * @param {Object} env - Worker bindings
 * @returns {Promise<null|{token: string, clientKey: string, conversationId: string, createdAt: number, lastActivity: number, messageCount: number}>}
 */
export async function incrementMessageCount(token, env) {
  const key = `session:${token}`;
  const data = await env.CHAT_SESSIONS.get(key);

  if (!data) {
    return null;
  }

  const session = JSON.parse(data);
  session.messageCount += 1;
  session.lastActivity = Date.now();

  await env.CHAT_SESSIONS.put(key, JSON.stringify(session), {
    expirationTtl: 600,
  });

  return { token, ...session };
}
