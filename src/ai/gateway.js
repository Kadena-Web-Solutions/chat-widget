/**
 * AI Gateway — LLM Routing & Budget Management
 *
 * Orchestrates AI calls through a tiered fallback system (primary → fallback →
 * emergency), tracks token budgets per client in KV, and streams responses as
 * Server-Sent Events.
 *
 * Tier Routing:
 *   1. PRIMARY   — try gemini-2.0-flash (best quality/cost)
 *   2. FALLBACK  — try gpt-4o-mini (alternative provider)
 *   3. EMERGENCY — try @cf/meta/llama-3.1-8b-instruct (Workers AI)
 *
 * Each tier gets up to 3 retry attempts with exponential backoff before
 * falling through to the next tier.
 *
 * Budget Tracking:
 *   KV key:     budget:{clientKey}:{YYYY-MM-DD}
 *   Value:      { inputTokens, outputTokens, costUSD }
 *   Soft limit: 80% of 500K tokens ($4 USD) → console.warn
 *   Hard limit: 100% of 500K tokens ($5 USD) → return 429 error
 */

import { ChatError } from '../errors.js';
import { getModelById, getTierOrderedModelIds, calculateCost } from './models.js';
import { getSystemPrompt } from './prompts.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAILY_TOKEN_LIMIT = 500_000;
const DAILY_COST_LIMIT = 5.00; // USD
const SOFT_LIMIT_RATIO = 0.8;
const MAX_RETRIES_PER_TIER = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s base, exponential: 1s, 2s, 4s

// ─── Budget Helpers ────────────────────────────────────────────────────────────

/**
 * Get today's date string in YYYY-MM-DD format.
 * @returns {string}
 */
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the KV key for a client's daily budget.
 * @param {string} clientKey
 * @returns {string}
 */
function budgetKey(clientKey) {
  return `budget:${clientKey}:${todayDateString()}`;
}

/**
 * Read current budget from KV, or return a zeroed budget.
 * @param {string} clientKey
 * @param {Object} env — Worker environment with CHAT_BUDGET binding
 * @returns {Promise<{inputTokens: number, outputTokens: number, costUSD: number}>}
 */
async function readBudget(clientKey, env) {
  try {
    const raw = await env.CHAT_BUDGET.get(budgetKey(clientKey));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[gateway] Failed to read budget for ${clientKey}: ${err.message}`);
  }
  return { inputTokens: 0, outputTokens: 0, costUSD: 0 };
}

/**
 * Persist budget to KV asynchronously (via ctx.waitUntil).
 * @param {string} clientKey
 * @param {{inputTokens: number, outputTokens: number, costUSD: number}} budget
 * @param {Object} env
 * @param {ExecutionContext} ctx
 */
function persistBudget(clientKey, budget, env, ctx) {
  const key = budgetKey(clientKey);
  const ttlSeconds = 86400 * 2; // Keep for 2 days

  ctx.waitUntil(
    env.CHAT_BUDGET.put(key, JSON.stringify(budget), { expirationTtl: ttlSeconds })
      .catch((err) => console.warn(`[gateway] Failed to persist budget for ${clientKey}: ${err.message}`)),
  );
}

/**
 * Estimate token count from a string.
 * Rough heuristic: ~4 characters per token for English text.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total input tokens from the messages array.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
function estimateInputTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
  }
  return total || 1; // Minimum 1 to avoid zero-cost
}

// ─── Budget Checking ───────────────────────────────────────────────────────────

/**
 * Check if the client has exceeded their daily AI budget.
 *
 * Soft alert at 80% (logs warning).
 * Hard stop at 100% (throws ChatError with 429).
 *
 * @param {string} clientKey — Client identifier
 * @param {Object} env — Worker environment with CHAT_BUDGET binding
 * @returns {Promise<{allowed: boolean, budget: Object, usedRatio: number}>}
 */
export async function checkBudget(clientKey, env) {
  const budget = await readBudget(clientKey, env);
  const tokenUsage = budget.inputTokens + budget.outputTokens;
  const tokenRatio = tokenUsage / DAILY_TOKEN_LIMIT;
  const costRatio = budget.costUSD / DAILY_COST_LIMIT;

  // Use the higher of the two ratios (token or cost based)
  const usedRatio = Math.max(tokenRatio, costRatio);

  // ── Hard stop at 100% ──────────────────────────────────────────────────
  if (usedRatio >= 1.0) {
    throw new ChatError(
      `Daily AI budget exhausted for ${clientKey}. Resets at midnight UTC.`,
      429,
      'BUDGET_EXCEEDED',
    );
  }

  // ── Soft alert at 80% ──────────────────────────────────────────────────
  if (usedRatio >= SOFT_LIMIT_RATIO) {
    console.warn(
      `[gateway] Budget warning for ${clientKey}: ${(usedRatio * 100).toFixed(1)}% used ` +
      `(${tokenUsage.toLocaleString()}/${DAILY_TOKEN_LIMIT.toLocaleString()} tokens, ` +
      `$${budget.costUSD.toFixed(4)}/${DAILY_COST_LIMIT.toFixed(2)} USD)`,
    );
  }

  return { allowed: true, budget, usedRatio };
}

// ─── AI Call with Retry ────────────────────────────────────────────────────────

/**
 * Call an AI model with retry logic.
 *
 * @param {string} modelId — Model identifier from MODEL_REGISTRY
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} env — Worker environment with AI binding
 * @param {boolean} stream — Whether to use streaming mode
 * @returns {Promise<ReadableStream|Object>} — Stream (if stream=true) or response object
 */
async function callAIWithRetry(modelId, messages, env, stream = true) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES_PER_TIER; attempt++) {
    try {
      console.log(
        `[gateway] Calling ${modelId} (attempt ${attempt}/${MAX_RETRIES_PER_TIER}, stream=${stream})`,
      );

      const result = await env.AI.run(modelId, {
        messages,
        stream,
      });

      if (!result) {
        throw new Error(`Empty response from ${modelId}`);
      }

      return result;
    } catch (err) {
      lastError = err;
      console.warn(
        `[gateway] ${modelId} attempt ${attempt} failed: ${err.message}`,
      );

      // Don't retry if it's a non-retryable error (like invalid model)
      if (err.message?.includes('not found') || err.message?.includes('invalid')) {
        break;
      }

      // Exponential backoff before retry (skip last attempt)
      if (attempt < MAX_RETRIES_PER_TIER) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`All ${MAX_RETRIES_PER_TIER} attempts failed for ${modelId}`);
}

// ─── SSE Stream Transform ──────────────────────────────────────────────────────

/**
 * SSE event encoder — creates a ReadableStream that formats chunks as
 * Server-Sent Events and manages the stream lifecycle.
 */
class SSEEncoder {
  constructor() {
    this._encoder = new TextEncoder();
    this._closed = false;
  }

  /**
   * Encode a content token as an SSE event.
   * @param {string} content — Text token to send
   * @returns {Uint8Array}
   */
  event(content) {
    const data = JSON.stringify({ content, role: 'assistant' });
    return this._encoder.encode(`data: ${data}\n\n`);
  }

  /**
   * Encode the end-of-stream signal.
   * @returns {Uint8Array}
   */
  done() {
    return this._encoder.encode('data: [DONE]\n\n');
  }

  /**
   * Encode an error event.
   * @param {string} code — Error code
   * @param {string} message — Error message
   * @returns {Uint8Array}
   */
  error(code, message) {
    const data = JSON.stringify({ error: { code, message } });
    return this._encoder.encode(`data: ${data}\n\n`);
  }
}

// ─── Streaming Response ────────────────────────────────────────────────────────

/**
 * Stream AI response as Server-Sent Events.
 *
 * Tries each model tier in order (primary → fallback → emergency). If a tier
 * exhausts its retries, falls through to the next tier. If all tiers fail,
 * sends an error event.
 *
 * @param {Array<{role: string, content: string}>} messages — Full conversation
 * @param {string} clientKey — Client identifier for budget tracking
 * @param {Object} clientConfig — Client configuration from CHAT_CLIENTS
 * @param {Object} env — Worker environment (AI, CHAT_BUDGET bindings)
 * @param {ExecutionContext} ctx — Worker execution context
 * @returns {Promise<ReadableStream>} SSE stream
 */
export async function streamAIResponse(messages, clientKey, clientConfig, env, ctx) {
  // ── Check budget before making AI call ──────────────────────────────────
  let budget;
  try {
    const budgetResult = await checkBudget(clientKey, env);
    budget = budgetResult.budget;
  } catch (err) {
    // Budget exceeded — return error SSE stream
    const encoder = new SSEEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.error(err.code || 'BUDGET_EXCEEDED', err.message));
        controller.enqueue(encoder.done());
        controller.close();
      },
    });
  }

  // ── Prepare messages with system prompt ─────────────────────────────────
  const systemPrompt = await getSystemPrompt(clientKey, clientConfig, env);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  // ── Estimate input tokens for budget ────────────────────────────────────
  const estimatedInputTokens = estimateInputTokens(fullMessages);
  const sse = new SSEEncoder();
  let outputTokenCount = 0;
  let selectedModelId = null;

  // ── Try each tier in order ──────────────────────────────────────────────
  const modelIds = getTierOrderedModelIds();
  let stream = null;
  let lastTierError = null;

  for (const modelId of modelIds) {
    try {
      stream = await callAIWithRetry(modelId, fullMessages, env, true);
      selectedModelId = modelId;
      break;
    } catch (err) {
      console.warn(
        `[gateway] Tier exhausted for ${modelId}: ${err.message}. Trying next tier...`,
      );
      lastTierError = err;
    }
  }

  // ── All tiers failed ───────────────────────────────────────────────────
  if (!stream || !selectedModelId) {
    const errMsg = lastTierError?.message || 'All AI tiers exhausted';
    return new ReadableStream({
      start(controller) {
        controller.enqueue(sse.error('AI_UNAVAILABLE', errMsg));
        controller.enqueue(sse.done());
        controller.close();
      },
    });
  }

  const model = getModelById(selectedModelId);
  const modelIdForBudget = selectedModelId;
  const reader = stream.getReader();

  // ── Build the SSE response stream ───────────────────────────────────────
  return new ReadableStream({
    async start(controller) {
      try {
        let buffer = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines (SSE from AI Gateway may have full lines)
          // AI Gateway typically streams: data: {"response":"token"}\n\n or raw text
          const tokens = extractTokens(buffer);
          buffer = tokens.remainder;

          for (const token of tokens.items) {
            if (token) {
              outputTokenCount++;
              controller.enqueue(sse.event(token));
            }
          }
        }

        // Flush any remaining content in buffer
        if (buffer.trim()) {
          const remaining = buffer.trim();
          if (remaining && !remaining.startsWith('data:')) {
            outputTokenCount++;
            controller.enqueue(sse.event(remaining));
          }
        }

        // ── Send end-of-stream ──────────────────────────────────────────
        controller.enqueue(sse.done());

        // ── Persist budget update ──────────────────────────────────────
        const newBudget = {
          inputTokens: budget.inputTokens + estimatedInputTokens,
          outputTokens: budget.outputTokens + outputTokenCount,
          costUSD: budget.costUSD + calculateCost(modelIdForBudget, estimatedInputTokens, outputTokenCount),
        };
        persistBudget(clientKey, newBudget, env, ctx);

        controller.close();
      } catch (err) {
        console.error(`[gateway] Stream error for ${selectedModelId}:`, err);
        controller.enqueue(sse.error('STREAM_ERROR', err.message || 'Stream interrupted'));
        controller.enqueue(sse.done());
        controller.close();
      }
    },

    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

/**
 * Extract tokens from raw AI Gateway stream output.
 *
 * Handles multiple formats:
 *   - AI Gateway JSON SSE:  data: {"response":"hello"}\n\n
 *   - Plain text chunks:    hello world
 *   - OpenAI-style chunks:  data: {"choices":[{"delta":{"content":"hi"}}]}\n\n
 *
 * @param {string} buffer — Accumulated text buffer
 * @returns {{items: string[], remainder: string}}
 */
function extractTokens(buffer) {
  const items = [];
  let remainder = buffer;

  while (remainder.length > 0) {
    // Try to parse as SSE data line
    const sseMatch = remainder.match(/^data:\s*(.+?)(?:\n\n|\n$)/);
    if (sseMatch) {
      const dataStr = sseMatch[1].trim();
      remainder = remainder.slice(sseMatch[0].length);

      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);

        // AI Gateway format: {"response":"text"}
        if (parsed.response !== undefined) {
          if (parsed.response) items.push(parsed.response);
          continue;
        }

        // OpenAI format: {"choices":[{"delta":{"content":"text"}}]}
        if (parsed.choices?.[0]?.delta?.content) {
          items.push(parsed.choices[0].delta.content);
          continue;
        }

        // Generic content field
        if (parsed.content) {
          items.push(parsed.content);
          continue;
        }
      } catch {
        // Not JSON — treat as plain text
        items.push(dataStr);
      }
    } else {
      // Stream partial content — emit what we can as plain text tokens
      // Split on spaces for word-level streaming, but only if we have a decent chunk
      if (remainder.length > 20) {
        const spaceIdx = remainder.lastIndexOf(' ');
        if (spaceIdx > 0) {
          const token = remainder.slice(0, spaceIdx + 1);
          remainder = remainder.slice(spaceIdx + 1);
          if (token.trim()) items.push(token);
        } else {
          // No spaces — emit the whole thing as one token
          items.push(remainder);
          remainder = '';
        }
      } else {
        // Not enough data to split — wait for more
        break;
      }
    }
  }

  return { items, remainder };
}

// ─── Non-Streaming Response ────────────────────────────────────────────────────

/**
 * Send an AI request and get the full response (non-streaming).
 *
 * For use cases where streaming is not appropriate (e.g., summary generation,
 * internal processing). Uses the same tier fallback and budget tracking as
 * streamAIResponse.
 *
 * @param {Array<{role: string, content: string}>} messages — Full conversation
 * @param {string} clientKey — Client identifier
 * @param {Object} clientConfig — Client configuration
 * @param {Object} env — Worker environment
 * @param {ExecutionContext} ctx — Worker execution context
 * @param {Object} [options] — Additional options
 * @param {boolean} [options.stream=true] — Whether to stream (default: true)
 * @returns {Promise<ReadableStream|string>} SSE stream or full response text
 */
export async function sendToAI(messages, clientKey, clientConfig, env, ctx, options = {}) {
  // ── Streaming path (default) ────────────────────────────────────────────
  if (options.stream !== false) {
    return streamAIResponse(messages, clientKey, clientConfig, env, ctx);
  }

  // ── Non-streaming path ──────────────────────────────────────────────────
  let budget;
  try {
    const budgetResult = await checkBudget(clientKey, env);
    budget = budgetResult.budget;
  } catch (err) {
    throw err; // Re-throw budget errors
  }

  const systemPrompt = await getSystemPrompt(clientKey, clientConfig, env);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const estimatedInputTokens = estimateInputTokens(fullMessages);
  const modelIds = getTierOrderedModelIds();
  let response = null;
  let selectedModelId = null;
  let lastError = null;

  for (const modelId of modelIds) {
    try {
      response = await callAIWithRetry(modelId, fullMessages, env, false);
      selectedModelId = modelId;
      break;
    } catch (err) {
      console.warn(
        `[gateway] Non-streaming tier exhausted for ${modelId}: ${err.message}`,
      );
      lastError = err;
    }
  }

  if (!response) {
    throw lastError || new Error('All AI tiers exhausted (non-streaming)');
  }

  // Extract response text
  let responseText = '';
  if (typeof response === 'string') {
    responseText = response;
  } else if (response.response) {
    responseText = response.response;
  } else if (response.choices?.[0]?.message?.content) {
    responseText = response.choices[0].message.content;
  } else if (response.text) {
    responseText = response.text;
  } else {
    responseText = JSON.stringify(response);
  }

  // Update budget
  const outputTokens = estimateTokens(responseText);
  const newBudget = {
    inputTokens: budget.inputTokens + estimatedInputTokens,
    outputTokens: budget.outputTokens + outputTokens,
    costUSD: budget.costUSD + calculateCost(selectedModelId, estimatedInputTokens, outputTokens),
  };
  persistBudget(clientKey, newBudget, env, ctx);

  return responseText;
}
