/**
 * AI Model Registry
 *
 * Defines all available AI models with cost data, token limits, and tier
 * classification. Used by the AI Gateway for model selection, cost tracking,
 * and fallback routing.
 *
 * Tiers:
 *   primary   — Best quality/cost balance (Gemini)
 *   fallback  — Alternative provider (OpenAI)
 *   emergency — Workers AI on-network model (Llama)
 */

// ─── Model Registry ────────────────────────────────────────────────────────────

export const MODEL_REGISTRY = {
  // ── PRIMARY ────────────────────────────────────────────────────────────────
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    maxTokens: 8192,
    tier: 'primary',
  },

  // ── FALLBACK ───────────────────────────────────────────────────────────────
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxTokens: 4096,
    tier: 'fallback',
  },

  // ── EMERGENCY ──────────────────────────────────────────────────────────────
  '@cf/meta/llama-3.1-8b-instruct': {
    id: '@cf/meta/llama-3.1-8b-instruct',
    provider: 'meta',
    name: 'Llama 3.1 8B Instruct',
    inputCostPer1M: 0, // Included in Workers AI
    outputCostPer1M: 0, // Included in Workers AI
    maxTokens: 2048,
    tier: 'emergency',
  },
};

// ─── Tier Order ────────────────────────────────────────────────────────────────

const TIER_ORDER = ['primary', 'fallback', 'emergency'];

// ─── Exports ───────────────────────────────────────────────────────────────────

/**
 * Get all models in a specific tier.
 * @param {string} tier — 'primary', 'fallback', or 'emergency'
 * @returns {Array<Object>} Array of model entries
 */
export function getModelsByTier(tier) {
  return Object.values(MODEL_REGISTRY).filter((m) => m.tier === tier);
}

/**
 * Look up a model by its ID.
 * @param {string} id — Model identifier (e.g., 'gemini-2.0-flash')
 * @returns {Object|null} Model entry or null if not found
 */
export function getModelById(id) {
  return MODEL_REGISTRY[id] || null;
}

/**
 * Get all model IDs ordered by tier (primary → fallback → emergency).
 * Used by the gateway to iterate through retry attempts.
 * @returns {Array<string>} Ordered model IDs
 */
export function getTierOrderedModelIds() {
  const ids = [];
  for (const tier of TIER_ORDER) {
    for (const model of Object.values(MODEL_REGISTRY)) {
      if (model.tier === tier) {
        ids.push(model.id);
      }
    }
  }
  return ids;
}

/**
 * Calculate the estimated cost for a set of tokens.
 * @param {string} modelId — Model identifier
 * @param {number} inputTokens — Number of input tokens
 * @param {number} outputTokens — Number of output tokens
 * @returns {number} Estimated cost in USD
 */
export function calculateCost(modelId, inputTokens, outputTokens) {
  const model = getModelById(modelId);
  if (!model) return 0;

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
  return inputCost + outputCost;
}
