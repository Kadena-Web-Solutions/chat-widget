// src/chat/session.js — Chat session management placeholder
export async function getSession(sessionId, env) {
  const data = await env.CHAT_SESSIONS.get(sessionId);
  return data ? JSON.parse(data) : null;
}

export async function setSession(sessionId, session, env) {
  await env.CHAT_SESSIONS.put(sessionId, JSON.stringify(session));
}

export async function deleteSession(sessionId, env) {
  await env.CHAT_SESSIONS.delete(sessionId);
}
