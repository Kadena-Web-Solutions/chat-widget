// src/utils.js — Utility functions placeholder
export function validateSession(sessionId) {
  return sessionId && sessionId.length > 0;
}

export function validateMessage(message) {
  return message && message.length > 0 && message.length <= 4096;
}
