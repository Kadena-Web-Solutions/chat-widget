/**
 * AI Response Formatting & Lead Extraction
 *
 * Formats raw AI output, extracts lead info from conversation text,
 * and detects escalation keywords for human handoff.
 */

export function formatAIResponse(rawContent, model, usage) {
  const inputTokens = usage?.prompt_tokens || usage?.input_tokens || 0;
  const outputTokens = usage?.completion_tokens || usage?.output_tokens || 0;

  return {
    text: rawContent,
    model: model || 'unknown',
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    timestamp: new Date().toISOString(),
  };
}

export function extractLeadInfo(conversationMessages) {
  if (!conversationMessages || !Array.isArray(conversationMessages)) {
    return { name: null, email: null, phone: null };
  }

  const userTexts = conversationMessages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  if (!userTexts) return { name: null, email: null, phone: null };

  const namePatterns = [
    /(?:my name is|i'm|i am|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  let name = null;
  for (const pattern of namePatterns) {
    const match = userTexts.match(pattern);
    if (match) {
      name = match[1].trim();
      break;
    }
  }

  const emailPatterns = [
    /(?:email|mail|e-?mail)[:\s]*([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /(?:reach me at|contact me at|message me at|send to)\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /(?:my email is|email is)\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i,
  ];

  let email = null;
  for (const pattern of emailPatterns) {
    const match = userTexts.match(pattern);
    if (match) {
      const candidate = match[1].trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
        email = candidate;
        break;
      }
    }
  }

  const phonePatterns = [
    /(?:phone|call|number|reach|contact)[:\s]*(\+?[\d\s()\-.]{7,20})/i,
    /(?:my number is|my phone is|phone is)\s+(\+?[\d\s()\-.]{7,20})/i,
    /(?:call me at|reach me at)\s+(\+?[\d\s()\-.]{7,20})/i,
  ];

  let phone = null;
  for (const pattern of phonePatterns) {
    const match = userTexts.match(pattern);
    if (match) {
      const digits = match[1].replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) {
        phone = digits;
        break;
      }
    }
  }

  return { name, email, phone };
}

const ESCALATION_KEYWORDS = [
  'human', 'agent', 'manager', 'supervisor', 'speak', 'talk',
  'real person', 'frustrated', 'angry', 'complaint',
  'unacceptable', 'cancel', 'refund', 'lawyer',
];

export function isEscalationKeyword(text) {
  if (!text || typeof text !== 'string') return false;

  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.some(keyword => lower.includes(keyword));
}
