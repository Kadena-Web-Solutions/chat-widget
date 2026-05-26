// widget/src/theme-engine.js — Theme fetching and application

const DEFAULT_CONFIG = {
  primary: '#2C5F2D',
  secondary: '#97BC62',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  botName: 'Assistant',
  botAvatar: '',
  welcomeMessage: 'Hello! How can I help you today?',
  position: 'bottom-left',
  disclaimer: 'Responses are AI-generated and may not always be accurate.',
  leadCaptureAfter: 3,
  leadFormTitle: 'Get in Touch',
  leadFormSubtitle: 'Leave your details and we will reach out to you.',
};

/**
 * Fetch widget configuration for a client.
 * @param {string} clientKey
 * @returns {Promise<object>}
 */
// Hard-coded production origin — the widget script is always served from this domain.
// For local dev with `wrangler dev`, override via window.__CHAT_WIDGET_API_BASE__.
const API_BASE = (typeof window !== 'undefined' && window.__CHAT_WIDGET_API_BASE__) || 'https://chat-widget.kadenaweb.solutions';

export { API_BASE };

export async function fetchConfig(clientKey) {
  if (!clientKey) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const res = await fetch(`${API_BASE}/api/config?client=${encodeURIComponent(clientKey)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Config fetch failed: ${res.status}`);
    }
    const data = await res.json();
    // API returns { name, chat: { botName, primaryColor, ... } } — flatten chat object
    const chatConfig = data.chat || data;
    // Map API keys to DEFAULT_CONFIG keys (primaryColor -> primary, secondaryColor -> secondary)
    const mapped = {
      ...(chatConfig.primaryColor && { primary: chatConfig.primaryColor }),
      ...(chatConfig.secondaryColor && { secondary: chatConfig.secondaryColor }),
      ...(chatConfig.fontFamily && { fontFamily: chatConfig.fontFamily }),
      ...(chatConfig.botName && { botName: chatConfig.botName }),
      ...(chatConfig.botAvatar && { botAvatar: chatConfig.botAvatar }),
      ...(chatConfig.welcomeMessage && { welcomeMessage: chatConfig.welcomeMessage }),
      ...(chatConfig.position && { position: chatConfig.position }),
      ...(chatConfig.disclaimer && { disclaimer: chatConfig.disclaimer }),
      ...(chatConfig.leadCaptureAfter != null && { leadCaptureAfter: chatConfig.leadCaptureAfter }),
      ...(chatConfig.leadFormTitle && { leadFormTitle: chatConfig.leadFormTitle }),
      ...(chatConfig.leadFormSubtitle && { leadFormSubtitle: chatConfig.leadFormSubtitle }),
      ...(chatConfig.sessionTimeout != null && { sessionTimeout: chatConfig.sessionTimeout }),
    };
    return { ...DEFAULT_CONFIG, ...mapped };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[chat-widget] Failed to load config, using defaults:', err.message);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Apply theme CSS custom properties to the shadow host.
 * @param {ShadowRoot} shadowRoot
 * @param {object} config
 */
export function applyTheme(shadowRoot, config) {
  const host = shadowRoot.host;
  if (!host) return;

  const vars = [
    ['--chat-primary', config.primary],
    ['--chat-secondary', config.secondary],
    ['--chat-font', config.fontFamily],
  ];

  for (const [name, value] of vars) {
    if (value) {
      host.style.setProperty(name, value);
    }
  }

if (config.position === 'bottom-left') {
    const trigger = shadowRoot.querySelector('.chat__trigger');
    const chatWindow = shadowRoot.querySelector('.chat__window');
    if (trigger) trigger.classList.add('chat__trigger--left');
    if (chatWindow) chatWindow.classList.add('chat__window--left');
  }
}
