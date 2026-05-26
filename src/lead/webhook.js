/**
 * Lead Webhook Dispatcher — Chat Widget → Contact Form Worker
 *
 * Dispatches captured chat lead data to the Kadena Web Solutions centralized
 * contact-form worker for enrichment, scoring, and multi-channel notification
 * delivery. Runs asynchronously via ctx.waitUntil() so it never blocks the
 * chat widget response.
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * Failures are logged to the D1 `audit_events` table but never thrown.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Forms worker endpoint for chat-originated leads */
const WEBHOOK_URL = 'https://forms.kadenaweb.solutions/from-chat';

/** Maximum retry attempts before giving up */
const MAX_RETRIES = 3;

/** Retry delay schedule in milliseconds (exponential: 1s, 2s, 4s) */
const RETRY_DELAYS = [1000, 2000, 4000];

// ─── Webhook Dispatch ─────────────────────────────────────────────────────────

/**
 * Dispatch lead data to the centralized forms worker.
 *
 * Designed to be called inside `ctx.waitUntil()` so it runs after the
 * response has been sent to the client. Failures are logged to the
 * D1 `audit_events` table for observability but are never thrown —
 * the chat widget response must succeed regardless of webhook outcome.
 *
 * @param {Object}  lead               — Lead record (camelCase from D1 or capture)
 * @param {string}  lead.id            — Lead UUID
 * @param {string}  lead.conversationId— Parent conversation UUID
 * @param {string}  lead.clientKey     — Client identifier
 * @param {string}  lead.name          — Lead name (nullable)
 * @param {string}  lead.email         — Lead email (required)
 * @param {string}  [lead.phone]       — Lead phone (nullable)
 * @param {string}  [lead.message]     — Lead message/summary
 * @param {number}  [lead.leadScore]   — Calculated lead score (0-100)
 * @param {string}  clientKey          — Client identifier (redundant, for convenience)
 * @param {Object}  clientConfig       — CHAT_CLIENTS entry
 * @param {Object}  env                — Worker env with `DB` binding
 * @returns {Promise<void>}
 */
export async function dispatchLeadWebhook(lead, clientKey, clientConfig, env) {
  const payload = buildPayload(lead, clientKey, clientConfig);

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kadena-Chat-Widget/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Success — log the event and return
        await logWebhookEvent(clientKey, 'webhook_delivered', {
          leadId: lead.id,
          attempt,
          status: response.status,
        }, env);
        return;
      }

      // Non-2xx response — log and retry
      lastError = new Error(`Webhook returned ${response.status}: ${await response.text().catch(() => '(no body)')}`);
    } catch (error) {
      lastError = error;
    }

    // Wait before retrying (exponential backoff)
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[attempt - 1]);
    }
  }

  // All retries exhausted — log failure to audit
  await logWebhookEvent(clientKey, 'webhook_failed', {
    leadId: lead.id,
    attempts: MAX_RETRIES,
    error: lastError?.message || 'Unknown error',
  }, env);

  console.error(
    `❌ [lead-webhook] Failed to dispatch lead ${lead.id} to forms worker after ${MAX_RETRIES} attempts:`,
    lastError?.message
  );
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build the JSON payload sent to the forms worker.
 *
 * @param {Object} lead         — Lead record
 * @param {string} clientKey    — Client identifier
 * @param {Object} clientConfig — CHAT_CLIENTS entry
 * @returns {Object} Payload object
 */
function buildPayload(lead, clientKey, clientConfig) {
  return {
    source: 'chat-widget',
    clientKey,
    name: lead.name || null,
    email: lead.email,
    phone: lead.phone || null,
    message: lead.message || null,
    leadScore: lead.leadScore || 0,
    conversationId: lead.conversationId || null,
    metadata: {
      leadId: lead.id,
      businessName: clientConfig?.name || null,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Log a webhook dispatch event to the D1 `audit_events` table.
 *
 * Runs inside ctx.waitUntil — failures here are silently swallowed to
 * avoid impacting the main response.
 *
 * @param {string} clientKey  — Client identifier
 * @param {string} eventType  — Event type (e.g. 'webhook_delivered', 'webhook_failed')
 * @param {Object} eventData  — Arbitrary event metadata
 * @param {Object} env        — Worker env with `DB` binding
 * @returns {Promise<void>}
 */
async function logWebhookEvent(clientKey, eventType, eventData, env) {
  try {
    if (!env.DB) return;

    const id        = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO audit_events (id, client_key, event_type, event_data, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, clientKey, eventType, JSON.stringify(eventData), timestamp)
      .run();
  } catch (error) {
    // Logging failure should never crash the worker
    console.error('⚠️ [lead-webhook] Failed to log audit event:', error.message);
  }
}

/**
 * Promise-based sleep helper.
 *
 * @param {number} ms — Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
