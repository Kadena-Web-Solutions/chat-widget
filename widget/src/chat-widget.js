// widget/src/chat-widget.js — Chat widget Shadow DOM custom element

import { SHADOW_STYLES } from './shadow-styles.js';
import { fetchConfig, applyTheme, API_BASE } from './theme-engine.js';
import { renderMessages, appendMessage } from './message-list.js';
import { escapeHTML, generateSessionToken, formatText } from './utils.js';
import { initInputArea } from './input-area.js';
import { initLeadForm, showLeadForm, hideLeadForm } from './lead-form.js';
import { sendMessage } from './streaming-client.js';

const CHAT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const SEND_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
const CLOSE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

export class ChatWidget extends HTMLElement {
  static get observedAttributes() {
    return ['data-client', 'data-sitekey'];
  }

  constructor() {
    super();
    this._state = {
      sessionId: '',
      messages: [],
      config: null,
      isOpen: false,
      isStreaming: false,
      leadCaptured: false,
      messageCount: 0,
    };
    this._abortController = null;
    this._cleanupFns = [];
  }

  connectedCallback() {
    const clientKey = this.getAttribute('data-client') || '';
    const siteKey = this.getAttribute('data-sitekey') || '';

    const shadow = this.attachShadow({ mode: 'open' });
    this._shadowRoot = shadow;

    this._buildDOM(shadow);
    this._initAsync(clientKey, siteKey, shadow);
  }

  async _initAsync(clientKey, siteKey, shadow) {
    const config = await fetchConfig(clientKey);
    this._state.config = config;

    if (config.has_chat === false || config.enabled === false) {
      this.style.display = 'none';
      return;
    }

    this._state.sessionId = generateSessionToken();

    applyTheme(shadow, config);

    const titleEl = shadow.querySelector('.chat__header-title');
    if (titleEl) {
      const avatar = config.botAvatar ? '<img class="chat__header-avatar" src="' + escapeHTML(config.botAvatar) + '" alt="">' : '';
      titleEl.innerHTML = avatar + '<span>' + escapeHTML(config.botName || 'Assistant') + '</span>';
    }

    const disclaimerEl = shadow.querySelector('.chat__disclaimer');
    if (disclaimerEl) {
      disclaimerEl.textContent = config.disclaimer || '';
    }

    if (config.welcomeMessage) {
      this._addMessage('assistant', config.welcomeMessage);
    }

    const inputCleanup = initInputArea(shadow, {
      onSend: (text) => this._handleSend(text),
      getDisabled: () => this._state.isStreaming,
    });
    this._cleanupFns.push(inputCleanup);

    const leadCleanup = initLeadForm(shadow, {
      config,
      onSubmit: (data) => this._handleLeadSubmit(data),
      onSkip: () => this._handleLeadSkip(),
    });
    this._cleanupFns.push(leadCleanup);

    const trigger = shadow.querySelector('.chat__trigger');
    const closeBtn = shadow.querySelector('.chat__header-close');
    const toggleWindow = () => this._toggleWindow();
    trigger.addEventListener('click', toggleWindow);
    closeBtn.addEventListener('click', toggleWindow);
    this._cleanupFns.push(() => {
      trigger.removeEventListener('click', toggleWindow);
      closeBtn.removeEventListener('click', toggleWindow);
    });

    trigger.setAttribute('aria-label', 'Open chat');
    const windowEl = shadow.querySelector('.chat__window');
    windowEl.setAttribute('role', 'dialog');
    windowEl.setAttribute('aria-label', 'Chat window');
  }

  disconnectedCallback() {
    for (const fn of this._cleanupFns) fn();
    this._cleanupFns = [];
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (this.shadowRoot) {
      this.disconnectedCallback();
      this.connectedCallback();
    }
  }

  _buildDOM(shadow) {
    const container = document.createElement('div');
    container.innerHTML = ''
      + '<button class="chat__trigger" aria-label="Open chat">' + CHAT_ICON_SVG + '</button>'
      + '<div class="chat__window" role="dialog" aria-label="Chat window">'
      + '  <div class="chat__header">'
      + '    <div class="chat__header-title"><span>Assistant</span></div>'
      + '    <button class="chat__header-close" aria-label="Close chat">' + CLOSE_ICON_SVG + '</button>'
      + '  </div>'
      + '  <div class="chat__messages"></div>'
      + '  <div class="chat__input">'
      + '    <textarea class="chat__input-field" placeholder="Type your message\u2026" rows="1"></textarea>'
      + '    <button class="chat__input-send" aria-label="Send">' + SEND_ICON_SVG + '</button>'
      + '  </div>'
      + '  <div class="chat__lead-form">'
      + '    <div class="chat__lead-form-title">Get in Touch</div>'
      + '    <div class="chat__lead-form-subtitle">Leave your details and we will reach out.</div>'
      + '    <div class="chat__lead-form-field">'
      + '      <label class="chat__lead-form-label" for="lead-name">Name</label>'
      + '      <input class="chat__lead-form-input" id="lead-name" type="text" name="name" placeholder="Your name">'
      + '      <div class="chat__lead-form-error">Please enter your name</div>'
      + '    </div>'
      + '    <div class="chat__lead-form-field">'
      + '      <label class="chat__lead-form-label" for="lead-email">Email</label>'
      + '      <input class="chat__lead-form-input" id="lead-email" type="email" name="email" placeholder="you@example.com">'
      + '      <div class="chat__lead-form-error">Please enter a valid email</div>'
      + '    </div>'
      + '    <div class="chat__lead-form-field">'
      + '      <label class="chat__lead-form-label" for="lead-phone">Phone (optional)</label>'
      + '      <input class="chat__lead-form-input" id="lead-phone" type="tel" name="phone" placeholder="+1 234 567 8900">'
      + '      <div class="chat__lead-form-error">Please enter a valid phone number</div>'
      + '    </div>'
      + '    <button class="chat__lead-form-submit" type="button">Submit</button>'
      + '    <button class="chat__lead-form-skip" type="button">Skip</button>'
      + '  </div>'
      + '  <div class="chat__disclaimer"></div>'
      + '</div>';

    const style = document.createElement('style');
    style.textContent = SHADOW_STYLES;
    shadow.appendChild(style);

    while (container.firstChild) {
      shadow.appendChild(container.firstChild);
    }
  }

  _toggleWindow() {
    this._state.isOpen = !this._state.isOpen;
    const windowEl = this._shadowRoot.querySelector('.chat__window');
    const trigger = this._shadowRoot.querySelector('.chat__trigger');
    if (this._state.isOpen) {
      windowEl.classList.add('chat__window--open');
      trigger.setAttribute('aria-expanded', 'true');
      const input = this._shadowRoot.querySelector('.chat__input-field');
      if (input) input.focus();
    } else {
      windowEl.classList.remove('chat__window--open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  _addMessage(roleOrMsg, content) {
    const msg = typeof roleOrMsg === 'object'
      ? roleOrMsg
      : { role: roleOrMsg, content, timestamp: new Date().toISOString() };
    this._state.messages.push(msg);
    appendMessage(this._shadowRoot, msg);
    if (msg.role === 'user') this._state.messageCount++;
  }

  _setInputDisabled(disabled) {
    const textarea = this._shadowRoot.querySelector('.chat__input-field');
    const sendBtn = this._shadowRoot.querySelector('.chat__input-send');
    if (textarea) textarea.disabled = disabled;
    if (sendBtn) sendBtn.disabled = disabled;
    if (!disabled && textarea) textarea.focus();
  }

  _showTyping(show) {
    const container = this._shadowRoot.querySelector('.chat__messages');
    if (!container) return;
    const existing = container.querySelector('.chat__typing');
    if (show && !existing) {
      const typing = document.createElement('div');
      typing.className = 'chat__typing';
      typing.innerHTML = '<span class="chat__typing-dot"></span><span class="chat__typing-dot"></span><span class="chat__typing-dot"></span>';
      container.appendChild(typing);
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    } else if (!show && existing) {
      existing.remove();
    }
  }

  _showLeadForm() {
    showLeadForm(this._shadowRoot);
  }

  async _handleSend(text) {
    if (!text.trim() || this._state.isStreaming) return;

    const config = this._state.config;
    const clientKey = this.getAttribute('data-client') || '';

    this._addMessage('user', text);

    if (!this._state.leadCaptured && config.leadCaptureAfter > 0 && this._state.messageCount >= config.leadCaptureAfter) {
      this._showLeadForm();
      return;
    }

    this._state.isStreaming = true;
    this._setInputDisabled(true);
    this._showTyping(true);

    const assistantContent = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    this._state.messages.push(assistantContent);

    const container = this._shadowRoot.querySelector('.chat__messages');
    const assistantEl = document.createElement('div');
    assistantEl.className = 'chat__message chat__message--assistant';
    container.appendChild(assistantEl);

    this._abortController = new AbortController();

    sendMessage(
      clientKey,
      this._state.sessionId,
      text,
      (chunk) => {
        this._showTyping(false);
        assistantContent.content += chunk;
        assistantEl.innerHTML = formatText(assistantContent.content);
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
      },
      () => {
        this._state.isStreaming = false;
        this._setInputDisabled(false);
        this._showTyping(false);
        this._abortController = null;
      },
      (err) => {
        this._state.isStreaming = false;
        this._setInputDisabled(false);
        this._showTyping(false);
        this._abortController = null;
        console.error('[chat-widget] Send error:', {
          message: err.message,
          name: err.name,
          stack: err.stack,
          clientKey,
          sessionId: this._state.sessionId,
        });
        this._addMessage({
          role: 'system',
          content: `Failed to send message: ${err.message || 'Unknown error'}. Please try again.`,
          timestamp: new Date().toISOString()
        });
      },
      this._abortController.signal,
      (serverToken) => { this._state.sessionId = serverToken; }
    );
  }

  async _handleLeadSubmit(data) {
    const clientKey = this.getAttribute('data-client') || '';
    this._state.leadCaptured = true;
    hideLeadForm(this._shadowRoot);

    try {
      const res = await fetch(`${API_BASE}/api/lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this._state.sessionId ? { 'X-Session-Token': this._state.sessionId } : {}),
        },
        body: JSON.stringify({ client: clientKey, ...data }),
      });
      if (res.ok) {
        this._addMessage('system', 'Thank you! We will be in touch soon.');
      } else {
        this._addMessage('system', 'Something went wrong saving your details. Please try again later.');
      }
    } catch {
      this._addMessage('system', 'Network error. Your details were not saved.');
    }
  }

  _handleLeadSkip() {
    this._state.leadCaptured = 'skipped';
    hideLeadForm(this._shadowRoot);
  }
}

customElements.define('chat-widget', ChatWidget);

function createWidgetFromScript() {
  if (document.querySelector('chat-widget')) return;
  const script = document.querySelector('script[src*="chat-widget"]');
  if (!script) return;
  const clientKey = script.getAttribute('data-client');
  const siteKey = script.getAttribute('data-sitekey');
  if (!clientKey) return;
  const widget = document.createElement('chat-widget');
  if (clientKey) widget.setAttribute('data-client', clientKey);
  if (siteKey) widget.setAttribute('data-sitekey', siteKey);
  document.body.appendChild(widget);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createWidgetFromScript);
} else {
  createWidgetFromScript();
}