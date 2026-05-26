// widget/src/message-list.js — Message list rendering

import { escapeHTML } from './utils.js';

/**
 * Simple markdown-like formatting: bold and italic.
 * @param {string} text
 * @returns {string}
 */
function formatText(text) {
  if (typeof text !== 'string') return '';
  // Bold: **text** or __text__
  let html = escapeHTML(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  html = html.replace(/(^|[^*])\*(.+?)\*(?![*])/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_(.+?)_(?!_)/g, '$1<em>$2</em>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

/**
 * Render messages into the shadow DOM message container.
 * @param {ShadowRoot} shadowRoot
 * @param {Array<{role:string, content:string, timestamp?:string}>} messages
 */
export function renderMessages(shadowRoot, messages) {
  const container = shadowRoot.querySelector('.chat__messages');
  if (!container) return;

  container.innerHTML = '';

  for (const msg of messages) {
    const el = document.createElement('div');
    const roleClass =
      msg.role === 'user'
        ? 'chat__message--user'
        : msg.role === 'system'
        ? 'chat__message--system'
        : 'chat__message--assistant';
    el.className = `chat__message ${roleClass}`;
    el.innerHTML = formatText(msg.content);

    if (msg.timestamp) {
      const time = document.createElement('span');
      time.className = 'chat__message-time';
      time.textContent = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      el.appendChild(time);
    }

    container.appendChild(el);
  }

  // Auto-scroll to bottom
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

/**
 * Append a single message without full re-render.
 * @param {ShadowRoot} shadowRoot
 * @param {{role:string, content:string, timestamp?:string}} message
 */
export function appendMessage(shadowRoot, message) {
  const container = shadowRoot.querySelector('.chat__messages');
  if (!container) return;

  const el = document.createElement('div');
  const roleClass =
    message.role === 'user'
      ? 'chat__message--user'
      : message.role === 'system'
      ? 'chat__message--system'
      : 'chat__message--assistant';
  el.className = `chat__message ${roleClass}`;
  el.innerHTML = formatText(message.content);

  if (message.timestamp) {
    const time = document.createElement('span');
    time.className = 'chat__message-time';
    time.textContent = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    el.appendChild(time);
  }

  container.appendChild(el);
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}
