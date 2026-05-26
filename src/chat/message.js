// src/chat/message.js — Message handling placeholder
export async function saveMessage(message, env) {
  // Will be implemented with D1 in Wave 2
  return { id: crypto.randomUUID(), ...message };
}

export async function getMessages(sessionId, limit, env) {
  // Will be implemented with D1 in Wave 2
  return [];
}
