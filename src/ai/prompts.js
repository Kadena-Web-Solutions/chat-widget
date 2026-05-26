/**
 * System Prompt Templates
 *
 * Generates system prompts for each client based on their business context.
 * Supports custom prompts (loaded via CHAT_CONFIG KV) and auto-generated
 * templates from the client configuration.
 *
 * Expected usage:
 *   const prompt = await getSystemPrompt(clientKey, clientConfig, env);
 */

// ─── Default Template ──────────────────────────────────────────────────────────

/**
 * Default system prompt template for general business chat.
 * Populated with client-specific context at generation time.
 */
const DEFAULT_TEMPLATE = (name) => `You are a helpful and concise customer service assistant for ${name}.
You help visitors learn about the business, its services, and answer common questions.

## Guidelines
- Be warm, professional, and conversational
- Keep responses clear and to the point — avoid long paragraphs
- Never invent services, pricing, hours, or policies you don't know
- If you're unsure about something, say: "I'd recommend reaching out to our team directly for that information"
- Do NOT make promises about availability, response times, or guarantees
- For technical or legal questions, suggest the user consult a professional

## Lead Capture
- After 3+ meaningful exchanges, gently suggest leaving contact information
- Example: "If you'd like a follow-up, I can have our team reach out. Would you mind sharing your name and email?"
- Never pressure the user to share information
- If the user asks to speak with a person, acknowledge immediately and offer to collect their contact details

## Handoff Keywords
If the user mentions any of these, respond helpfully and offer to connect them with a real person:
- "speak to someone", "real person", "manager", "human", "call", "phone", "appointment"

## Response Style
- Do NOT repeat or rephrase the welcome greeting — it is already shown to the visitor
- Do NOT start responses with "Welcome to..." or "Hello, thanks for visiting..." — the visitor is already in the conversation
- Jump directly into answering the visitor's question
- Be concise. Aim for 2-3 sentences unless the question requires more detail

## Anti-Hallucination
You are an assistant for ${name}. Only reference information that you know is true about this specific business. Do not fabricate:
- Specific pricing or rates
- Exact business hours
- Physical addresses
- Names of staff members
- Past projects or case studies you haven't been told about
- Accreditations, certifications, or licenses
- Client testimonials

When in doubt, say you don't have that information and offer to connect them with the team.`;

// ─── Business Context Injector ─────────────────────────────────────────────────

/**
 * Build business context string from client configuration.
 * Extracts relevant fields to ground the AI with real business info.
 *
 * @param {Object} clientConfig — Full client configuration from CHAT_CLIENTS
 * @returns {string} Business context paragraph
 */
function buildBusinessContext(clientConfig) {
  const name = clientConfig.name || 'this business';
  const parts = [`You are assisting visitors for **${name}**.`];

  // Do NOT include welcomeMessage — the widget already shows it.
  // Including it causes the AI to regurgitate the greeting in every response.

  return parts.join('\n');
}

// ─── Prompt Cache (in-memory, per-request lifetime) ────────────────────────────

/**
 * Weak cache for generated prompts. Cache key is clientKey.
 * Since Workers may handle requests for multiple clients, this avoids
 * regenerating the same prompt repeatedly within a single request lifecycle.
 * @type {Map<string, string>}
 */
const promptCache = new Map();

// ─── Exports ───────────────────────────────────────────────────────────────────

/**
 * Generate or retrieve the system prompt for a given client.
 *
 * Priority order:
 *   1. Custom prompt from clientConfig.chat.systemPrompt (if it contains actual prompt text, not a file path)
 *   2. Custom prompt loaded from CHAT_CONFIG KV (if systemPrompt references a KV key)
 *   3. Auto-generated template using business name and context
 *
 * @param {string} clientKey — Client identifier (e.g., 'mkstucco.com')
 * @param {Object} clientConfig — Full client configuration from CHAT_CLIENTS
 * @param {Object} [env] — Worker environment bindings (for KV access)
 * @returns {Promise<string>} The system prompt string
 */
export async function getSystemPrompt(clientKey, clientConfig, env) {
  // Check in-memory cache first
  const cacheKey = clientKey || 'default';
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  const chatConfig = clientConfig?.chat || {};
  const businessName = clientConfig?.name || 'our business';

  // ── 1. Check for inline custom prompt ──────────────────────────────────
  const systemPromptField = chatConfig.systemPrompt;
  if (systemPromptField && typeof systemPromptField === 'string') {
    // If the prompt looks like actual content (not a file path reference), use it
    if (!isFilePath(systemPromptField)) {
      const prompt = systemPromptField;
      promptCache.set(cacheKey, prompt);
      return prompt;
    }

    // ── 2. Try loading custom prompt from KV ─────────────────────────────
    if (env && env.CHAT_CONFIG) {
      try {
        const kvKey = `prompt:${clientKey}`;
        const stored = await env.CHAT_CONFIG.get(kvKey);
        if (stored) {
          promptCache.set(cacheKey, stored);
          return stored;
        }
      } catch (err) {
        // KV access failed — fall through to template
        console.warn(`[prompts] KV lookup failed for ${clientKey}: ${err.message}`);
      }
    }
  }

  // ── 3. Generate from template ──────────────────────────────────────────
  const context = buildBusinessContext(clientConfig);
  const template = DEFAULT_TEMPLATE(businessName);
  const prompt = `${context}\n\n${template}`;

  promptCache.set(cacheKey, prompt);
  return prompt;
}

/**
 * Clear the in-memory prompt cache.
 * Useful for testing or when configuration changes.
 */
export function clearPromptCache() {
  promptCache.clear();
}

/**
 * Get a simple system prompt without KV lookups.
 * Synchronous version for use when KV/env is not available.
 *
 * @param {Object} clientConfig — Client configuration
 * @returns {string} System prompt
 */
export function getSimpleSystemPrompt(clientConfig) {
  const businessName = clientConfig?.name || 'our business';
  const context = buildBusinessContext(clientConfig);
  return `${context}\n\n${DEFAULT_TEMPLATE(businessName)}`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check if a systemPrompt value looks like a file path rather than actual content.
 * File paths start with 'custom/' or end with '.md', '.txt', '.prompt'.
 *
 * @param {string} value — The systemPrompt field value
 * @returns {boolean} True if it looks like a file path reference
 */
function isFilePath(value) {
  return value.startsWith('custom/') ||
    value.startsWith('./') ||
    value.endsWith('.md') ||
    value.endsWith('.txt') ||
    value.endsWith('.prompt');
}
