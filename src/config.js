/**
 * Chat Widget Configuration Registry
 * Defines all client sites, their allowed origins, and chat widget settings.
 *
 * Structure per client:
 *   - name: Full business name
 *   - allowedOrigins: Array of valid hostnames (production, www, preview)
 *   - chat: Widget configuration
 *   - notifications: Notification channels (email for now)
 */

/**
 * CHAT_CLIENTS registry - all 7 client sites + default (KWS)
 */
export const CHAT_CLIENTS = {
  'mkstucco.com': {
    name: 'MK Stucco LLC',
    allowedOrigins: ['mkstuccollc.com', 'www.mkstuccollc.com', 'mk-stucco-llc.pages.dev'],
    chat: {
      enabled: true,
      botName: 'MK Stucco Assistant',
      welcomeMessage: 'Welcome to MK Stucco! I\'m here to help with your stucco and exterior finishing questions.',
      primaryColor: '#2C5F2D',
      secondaryColor: '#97BC62',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-mkstucco.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'office@mkstuccollc.com' }
    }
  },

  'nixonconsulting.com': {
    name: 'Nixon Consulting, Inc.',
    allowedOrigins: ['nixonconsulting.net', 'www.nixonconsulting.net', 'nixon-consulting.pages.dev'],
    chat: {
      enabled: true,
      botName: 'Nixon Assistant',
      welcomeMessage: 'Hello! I\'m here to help with your consulting needs. How can I assist you today?',
      primaryColor: '#1C3A5C',
      secondaryColor: '#4A7BA7',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-nixon.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'contact@nixonconsulting.net' }
    }
  },

  'generationplastering.com': {
    name: 'Generation Plastering LLC',
    allowedOrigins: ['generationplastering.com', 'www.generationplastering.com', 'generation-plastering.pages.dev'],
    chat: {
      enabled: true,
      botName: 'Gen Plastering Assistant',
      welcomeMessage: 'Welcome to Generation Plastering! I\'m here to help with your plastering and rendering questions.',
      primaryColor: '#D4792B',
      secondaryColor: '#F5E6D3',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-generation.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'emmanuelg@generationplastering.com' }
    }
  },

  'jgpcolorado.com': {
    name: 'JG Plastering Colorado',
    allowedOrigins: ['jgpcolorado.com', 'www.jgpcolorado.com', 'jg-plastering.pages.dev'],
    chat: {
      enabled: true,
      botName: 'JG Plastering Assistant',
      welcomeMessage: 'Welcome to JG Plastering Colorado! How can I help you today?',
      primaryColor: '#1E3A5F',
      secondaryColor: '#4A90D9',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-jgp.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'info@jgpcolorado.com' }
    }
  },

  'rg-drywall.com': {
    name: 'RG Drywall LLC',
    allowedOrigins: ['rg-drywall.com', 'www.rg-drywall.com', 'rg-drywall-llc.pages.dev'],
    chat: {
      enabled: true,
      botName: 'RG Drywall Assistant',
      welcomeMessage: 'Welcome to RG Drywall! I\'m here to help with your drywall and construction questions.',
      primaryColor: '#3A5A7C',
      secondaryColor: '#8FA4BD',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-rg.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'randgdrywall@gmail.com' }
    }
  },

  'floorwater.gg': {
    name: 'Floor Water Gang',
    allowedOrigins: ['floorwater.gg', 'www.floorwater.gg', 'floor-water-gang.pages.dev'],
    chat: {
      enabled: true,
      botName: 'FWG Assistant',
      welcomeMessage: 'Welcome to Floor Water Gang! How can I help you today?',
      primaryColor: '#7B2D8E',
      secondaryColor: '#E040FB',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-floorwater.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'human', 'call'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'contact@kadenaweb.solutions' }
    }
  },

  'mrweedbuakhao.com': {
    name: 'Mr Weed Buakhao',
    allowedOrigins: ['mrweedbuakhao.com', 'www.mrweedbuakhao.com', 'mr-weed-buakhao.pages.dev'],
    chat: {
      enabled: true,
      botName: 'Mr Weed Assistant',
      welcomeMessage: 'Welcome to Mr Weed Buakhao! How can I help you today?',
      primaryColor: '#2E7D32',
      secondaryColor: '#81C784',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-right',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-mrweed.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'manager', 'human', 'call', 'phone'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'contact@kadenaweb.solutions' }
    }
  },

  // Default / Kadena Web Solutions
  'default': {
    name: 'Kadena Web Solutions',
    allowedOrigins: ['kadenaweb.solutions', 'www.kadenaweb.solutions', 'kadena-web-solutions.pages.dev'],
    chat: {
      enabled: true,
      botName: 'KWS Assistant',
      welcomeMessage: 'Welcome to Kadena Web Solutions! How can I help you today?',
      primaryColor: '#012970',
      secondaryColor: '#6776f4',
      fontFamily: 'Inter, system-ui, sans-serif',
      botAvatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Ccircle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23666%22/%3E%3Cpath d=%22M12 16h16M12 20h16M12 24h10%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 fill=%22none%22/%3E%3C/svg%3E',
      position: 'bottom-left',
      disclaimer: 'AI assistant · Responses may be reviewed by our team',
      model: 'gemini-2.0-flash',
      fallbackModel: 'gpt-4o-mini',
      systemPrompt: 'custom/system-prompt-kws.md',
      leadCaptureAfter: 3,
      autoCapture: true,
      escalationKeywords: ['speak to someone', 'real person', 'human', 'call'],
      escalationTimeout: 300,
      sessionTimeout: 600,
      maxMessages: 50
    },
    notifications: {
      email: { to: 'contact@kadenaweb.solutions' }
    }
  }
};

/**
 * Resolve client config from request Origin header.
 * @param {Request} request
 * @returns {Object} Client configuration
 */
export function getClientConfig(request) {
  const url = new URL(request.url);
  const clientParam = url.searchParams.get('client');

  if (clientParam) {
    const byKey = CHAT_CLIENTS[clientParam];
    if (byKey) return byKey;
  }

  const origin = request.headers.get('Origin');
  if (!origin) return CHAT_CLIENTS.default;

  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return CHAT_CLIENTS.default;
  }

  for (const [key, config] of Object.entries(CHAT_CLIENTS)) {
    if (key === 'default') continue;
    if (config.allowedOrigins.includes(hostname)) {
      return config;
    }
    for (const allowed of config.allowedOrigins) {
      if (hostname.endsWith('.' + allowed)) {
        return config;
      }
    }
  }

  return CHAT_CLIENTS.default;
}

/**
 * Resolve client config by key directly.
 * @param {string} clientKey - The config key (e.g., 'mkstucco.com')
 * @returns {Object} Client configuration
 */
export function getClientConfigByKey(clientKey) {
  if (CHAT_CLIENTS[clientKey]) {
    return CHAT_CLIENTS[clientKey];
  }
  return CHAT_CLIENTS.default;
}