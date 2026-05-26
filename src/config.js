// src/config.js — Site configurations placeholder
export default {
  'example.com': {
    name: 'Example Site',
    widget: {
      theme: 'light',
      position: 'bottom-right'
    },
    rateLimits: {
      messagesPerMinute: 10,
      sessionsPerHour: 5
    },
    ai: {
      enabled: true,
      budget: 1000
    }
  }
};
