/**
 * Human Handoff Detection and Notification
 *
 * Detects when a chat conversation should be escalated to a human,
 * marks the conversation as 'escalated' in D1, and dispatches a
 * notification to the business via the existing webhook system.
 *
 * Called from handler.js and streaming.js after each AI response:
 *   const escalation = detectEscalationNeed(recentMessages, clientConfig);
 *   if (escalation.shouldEscalate) {
 *     ctx.waitUntil(handleEscalation(conversationId, escalation.reason, escalation.confidence, env, ctx));
 *   }
 *
 * D1 tables: conversations (status), messages (content scan), audit_events (log)
 */

import { getClientConfigByKey } from '../config.js';
import { escalateConversation, getConversation } from './conversation.js';
import { dispatchLeadWebhook } from '../lead/webhook.js';

// ─── Escalation Keywords ──────────────────────────────────────────────────────

/**
 * Core escalation keywords — words/phrases that indicate a visitor wants
 * to speak with a human. Case-insensitive matching.
 */
export const ESCALATION_KEYWORDS = [
  // Core escalation triggers
  'human', 'agent', 'manager', 'supervisor',
  'speak to someone', 'talk to someone', 'real person',
  'live agent', 'customer service', 'customer support', 'representative',
  // Frustration signals
  'frustrated', 'frustrating', 'angry', 'upset',
  'unacceptable', 'terrible', 'worst', 'hate',
  'never again', 'cancel', 'refund', 'lawyer', 'attorney',
  'better business bureau', 'bbb', 'complaint', 'dispute',
];

// ─── Sub-lists ────────────────────────────────────────────────────────────────

/** Words that trigger on explicit escalation detection */
const EXPLICIT_ESCALATION = [
  'human', 'agent', 'manager', 'supervisor',
  'speak to someone', 'talk to someone', 'real person',
  'live agent', 'customer service', 'customer support', 'representative',
];

/** Words indicating negative sentiment */
const NEGATIVE_SENTIMENT = [
  'unacceptable', 'terrible', 'worst', 'hate', 'never again',
  'cancel', 'refund', 'lawyer', 'attorney',
  'better business bureau', 'bbb',
];

/** Basic profanity list for frustration detection */
const PROFANITY = [
  'fuck', 'shit', 'damn', 'bitch', 'bastard', 'asshole',
  'goddamn', 'piss', 'crap', 'dick', 'hell',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check if text contains any of the given keywords.
 * Normalizes text to lowercase before comparison.
 *
 * @param {string}  text     — Message content
 * @param {string[]} keywords — Keywords to search for
 * @returns {string|null} First matched keyword, or null
 */
function findKeyword(text, keywords) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

/**
 * Detect ALL CAPS shouting.
 * Flags if 3+ words in a row are all-uppercase and 3+ characters long,
 * OR if there are 3+ all-caps words overall.
 *
 * @param {string} text
 * @returns {{ detected: boolean, count: number }}
 */
function detectShouting(text) {
  const words = text.split(/\s+/);
  let streak = 0;

  for (const word of words) {
    // Skip very short words (1-2 chars like "I", "IS", "ME") — they don't
    // break a streak but also don't contribute to it.
    if (word.length < 3) continue;

    if (word === word.toUpperCase() && /[A-Z]/.test(word)) {
      streak++;
      if (streak >= 3) return { detected: true, count: streak };
    } else {
      streak = 0;
    }
  }

  // Fallback: count all-caps words (3+ chars) across entire message
  const allCaps = words.filter(w =>
    w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w),
  );
  return { detected: allCaps.length >= 3, count: allCaps.length };
}

/**
 * Count exclamation marks in text.
 * @param {string} text
 * @returns {number}
 */
function countExclamations(text) {
  return (text.match(/!/g) || []).length;
}

/**
 * Detect repeated similar questions across user messages.
 * Uses Jaccard word-set similarity (threshold > 0.6).
 * Flags 3+ similar pairs in recent messages.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {{ detected: boolean, count: number }}
 */
function detectRepeatedQuestions(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) return { detected: false, count: 0 };

  let similarPairs = 0;

  for (let i = 0; i < userMessages.length - 1; i++) {
    for (let j = i + 1; j < userMessages.length && j < i + 4; j++) {
      // Identical messages are definitely repeated
      if (userMessages[i].content === userMessages[j].content) {
        similarPairs++;
        continue;
      }

      // Word-set Jaccard similarity
      const words1 = new Set(
        userMessages[i].content.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 2),
      );
      const words2 = new Set(
        userMessages[j].content.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 2),
      );

      if (words1.size === 0 || words2.size === 0) continue;

      let intersection = 0;
      for (const w of words1) {
        if (words2.has(w)) intersection++;
      }

      const union = new Set([...words1, ...words2]).size;
      if (intersection / union > 0.6) {
        similarPairs++;
      }
    }
  }

  return { detected: similarPairs >= 3, count: similarPairs };
}

// ─── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detect need for escalation in a conversation.
 *
 * Analyzes recent messages for escalation signals:
 * 1. Explicit escalation keywords in last 3 user messages
 * 2. Frustration signals (shouting, exclamation overload, repeated questions, profanity)
 * 3. Negative sentiment patterns
 * 4. Client-specific escalationKeywords from config
 * 5. Prolonged unresolved conversations (5+ user messages)
 *
 * Confidence levels:
 * - high:   Direct keyword match OR 3+ frustration signals
 * - medium: 2+ frustration patterns OR unresolved conversation with negative sentiment
 * - low:    Single frustration signal combined with other factors
 *
 * @param {Array<{role: string, content: string}>} messages    — Recent messages (last 10)
 * @param {Object}                                 clientConfig — Client configuration from CHAT_CLIENTS
 * @returns {{ shouldEscalate: boolean, reason: string, confidence: 'high'|'medium'|'low' }}
 */
export function detectEscalationNeed(messages, clientConfig) {
  const reasons = [];
  let frustrationSignals = 0;
  let explicitMatch = null;

  const userMessages = messages.filter(m => m.role === 'user');
  const last3User = userMessages.slice(-3);
  const last10User = userMessages.slice(-10);

  // ── 1. Explicit escalation keywords in last 3 messages ──────────────────
  const clientKeywords = (clientConfig?.chat?.escalationKeywords || [])
    .map(k => k.toLowerCase());

  for (const msg of last3User) {
    const match = findKeyword(msg.content, EXPLICIT_ESCALATION);
    if (match) {
      explicitMatch = match;
      reasons.push(`Explicit escalation: "${match}"`);
      break;
    }
  }

  // ── 2. Frustration signals ──────────────────────────────────────────────

  // 2a. ALL CAPS shouting
  for (const msg of last10User) {
    const shouting = detectShouting(msg.content);
    if (shouting.detected) {
      reasons.push('ALL CAPS shouting detected');
      frustrationSignals++;
      break;
    }
  }

  // 2b. Exclamation overload (5+ in a single message)
  for (const msg of last10User) {
    if (countExclamations(msg.content) >= 5) {
      reasons.push('Exclamation overload (5+ marks)');
      frustrationSignals++;
      break;
    }
  }

  // 2c. Repeated similar questions
  const repeated = detectRepeatedQuestions(userMessages);
  if (repeated.detected) {
    reasons.push(`Repeated similar questions (${repeated.count} pairs)`);
    frustrationSignals++;
  }

  // 2d. Profanity detection
  for (const msg of last10User) {
    if (findKeyword(msg.content, PROFANITY)) {
      reasons.push('Profanity detected');
      frustrationSignals++;
      break;
    }
  }

  // ── 3. Negative sentiment ───────────────────────────────────────────────
  let sentimentMatch = null;
  for (const msg of last10User) {
    const match = findKeyword(msg.content, NEGATIVE_SENTIMENT);
    if (match) {
      sentimentMatch = match;
      reasons.push(`Negative sentiment: "${match}"`);
      break;
    }
  }

  // ── 4. Client-specific escalation keywords (check if not already found) ──
  if (!explicitMatch && clientKeywords.length > 0) {
    for (const msg of last3User) {
      for (const keyword of clientKeywords) {
        if (msg.content.toLowerCase().includes(keyword.toLowerCase())) {
          explicitMatch = keyword;
          reasons.push(`Client escalation keyword: "${keyword}"`);
          break;
        }
      }
      if (explicitMatch) break;
    }
  }

  // ── 5. Prolonged unresolved conversation ────────────────────────────────
  const unresolved = userMessages.length >= 5;

  // ── Determine confidence ────────────────────────────────────────────────
  let confidence = 'low';
  let shouldEscalate = false;

  if (explicitMatch) {
    confidence = 'high';
    shouldEscalate = true;
  } else if (frustrationSignals >= 3) {
    confidence = 'high';
    shouldEscalate = true;
  } else if (frustrationSignals >= 2 || (sentimentMatch && unresolved)) {
    confidence = 'medium';
    shouldEscalate = true;
  } else if (frustrationSignals >= 1 && (sentimentMatch || unresolved)) {
    confidence = 'low';
    shouldEscalate = true;
  }

  return {
    shouldEscalate,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No escalation signals detected',
    confidence,
  };
}

// ─── Escalation Handler ───────────────────────────────────────────────────────

/**
 * Execute the escalation workflow.
 *
 * 1. Mark conversation as 'escalated' in D1 via escalateConversation()
 * 2. Retrieve conversation details for notification context
 * 3. Dispatch webhook notification via dispatchLeadWebhook()
 * 4. Log escalation event to D1 audit_events table
 *
 * Webhook dispatch and audit logging failures are caught and logged —
 * they NEVER fail the escalation itself. The conversation escalation
 * is the critical path.
 *
 * @param {string}          conversationId — Conversation UUID
 * @param {string}          reason         — Human-readable escalation reason
 * @param {'high'|'medium'|'low'} confidence — Escalation confidence level
 * @param {Object}          env            — Worker env with DB binding
 * @param {ExecutionContext} ctx           — Worker execution context (unused; API compatibility)
 * @returns {Promise<{ escalated: boolean, conversationId: string, notificationSent: boolean }>}
 */
export async function handleEscalation(conversationId, reason, confidence, env, ctx) {
  let notificationSent = false;

  // ── 1. Escalate in D1 (critical — must succeed) ─────────────────────────
  try {
    await escalateConversation(conversationId, env);
  } catch (error) {
    console.error(
      `[handoff] Failed to escalate conversation ${conversationId}:`,
      error.message,
    );
    return { escalated: false, conversationId, notificationSent: false };
  }

  // ── 2. Retrieve conversation for context ────────────────────────────────
  let clientKey;
  try {
    const { conversation } = await getConversation(conversationId, env);
    clientKey = conversation.clientKey || 'default';
  } catch (error) {
    // Conversation exists (just escalated it) but retrieval failed
    console.warn(
      `[handoff] Could not retrieve conversation ${conversationId} for notification:`,
      error.message,
    );
    return { escalated: true, conversationId, notificationSent: false };
  }

  // ── 3. Dispatch webhook notification ────────────────────────────────────
  try {
    const clientConfig = getClientConfigByKey(clientKey);

    // Build a lead-like record for the webhook dispatcher
    const escalationLead = {
      id: crypto.randomUUID(),
      conversationId,
      clientKey,
      name: null,
      email: null,
      phone: null,
      message: `[Escalation — ${confidence}] ${reason}`,
      leadScore: confidence === 'high' ? 90 : confidence === 'medium' ? 70 : 40,
    };

    await dispatchLeadWebhook(escalationLead, clientKey, clientConfig, env);
    notificationSent = true;
  } catch (error) {
    // Notification failure MUST NOT fail the escalation
    console.error(
      `[handoff] Webhook notification failed for conversation ${conversationId}:`,
      error.message,
    );
  }

  // ── 4. Log escalation to audit_events ───────────────────────────────────
  try {
    if (env.DB) {
      const auditId = crypto.randomUUID();
      const timestamp = Math.floor(Date.now() / 1000);

      const eventData = JSON.stringify({
        conversationId,
        reason,
        confidence,
        notificationSent,
        clientKey,
      });

      await env.DB.prepare(
        `INSERT INTO audit_events (id, client_key, event_type, event_data, created_at)
         VALUES (?, ?, 'escalation', ?, ?)`,
      )
        .bind(auditId, clientKey, eventData, timestamp)
        .run();
    }
  } catch (error) {
    // Audit logging failure should never crash
    console.error(
      `[handoff] Failed to log escalation audit event for ${conversationId}:`,
      error.message,
    );
  }

  // ── 5. Return result ───────────────────────────────────────────────────
  console.log(
    `[handoff] Conversation ${conversationId} escalated (${confidence}): ${reason}. ` +
    `Notification ${notificationSent ? 'sent' : 'failed'}.`,
  );

  return {
    escalated: true,
    conversationId,
    notificationSent,
  };
}
