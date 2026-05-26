// widget/src/shadow-styles.js — All CSS for the chat widget Shadow DOM

export const SHADOW_STYLES = /* css */ `
  :host {
    --chat-primary: #2C5F2D;
    --chat-secondary: #97BC62;
    --chat-surface: #ffffff;
    --chat-surface-alt: #f5f7f5;
    --chat-text: #1a1a1a;
    --chat-text-muted: #6b7280;
    --chat-border: #e5e7eb;
    --chat-error: #dc2626;
    --chat-success: #16a34a;
    --chat-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --chat-radius-sm: 6px;
    --chat-radius-md: 12px;
    --chat-radius-lg: 16px;
    --chat-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    --chat-shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.18);
    --chat-transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    --chat-position: left;
    font-family: var(--chat-font);
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: inherit;
    margin: 0;
    padding: 0;
  }

  .chat__trigger {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    background: var(--chat-primary);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--chat-shadow-lg);
    transition: transform var(--chat-transition), background var(--chat-transition);
    z-index: 2147483647;
    font-family: inherit;
    font-size: 24px;
    line-height: 1;
    padding: 0;
    outline: none;
  }

  .chat__trigger:hover {
    transform: scale(1.08);
    background: var(--chat-secondary);
  }

  .chat__trigger:active {
    transform: scale(0.96);
  }

  .chat__trigger--hidden {
    display: none !important;
  }

  .chat__window {
    position: fixed;
    bottom: 88px;
    right: 20px;
    width: 380px;
    height: 560px;
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 108px);
    background: var(--chat-surface);
    border-radius: var(--chat-radius-lg);
    box-shadow: var(--chat-shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483646;
    opacity: 0;
    transform: translateY(20px) scale(0.96);
    pointer-events: none;
    transition: opacity var(--chat-transition), transform var(--chat-transition);
  }

  .chat__window--open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .chat__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--chat-primary);
    color: #fff;
    flex-shrink: 0;
  }

  .chat__header-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .chat__header-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(255,255,255,0.2);
  }

  .chat__header-close {
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255,255,255,0.15);
    color: #fff;
    border-radius: var(--chat-radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
    transition: background var(--chat-transition);
    font-family: inherit;
    padding: 0;
    outline: none;
  }

  .chat__header-close:hover {
    background: rgba(255,255,255,0.3);
  }

  .chat__messages {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-behavior: smooth;
  }

  .chat__message {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: var(--chat-radius-md);
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
    animation: chatFadeIn 0.25s ease;
  }

  @keyframes chatFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .chat__message--assistant {
    align-self: flex-start;
    background: var(--chat-surface-alt);
    color: var(--chat-text);
    border-bottom-left-radius: var(--chat-radius-sm);
  }

  .chat__message--user {
    align-self: flex-end;
    background: var(--chat-primary);
    color: #fff;
    border-bottom-right-radius: var(--chat-radius-sm);
  }

  .chat__message--system {
    align-self: center;
    background: transparent;
    color: var(--chat-text-muted);
    font-size: 12px;
    padding: 4px 8px;
    max-width: 100%;
    text-align: center;
  }

  .chat__message-time {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 4px;
    display: block;
  }

  .chat__typing {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 14px 16px;
    background: var(--chat-surface-alt);
    border-radius: var(--chat-radius-md);
    border-bottom-left-radius: var(--chat-radius-sm);
  }

  .chat__typing-dot {
    width: 6px;
    height: 6px;
    background: var(--chat-text-muted);
    border-radius: 50%;
    animation: chatTypingBounce 1.4s infinite ease-in-out both;
  }

  .chat__typing-dot:nth-child(1) { animation-delay: -0.32s; }
  .chat__typing-dot:nth-child(2) { animation-delay: -0.16s; }

  @keyframes chatTypingBounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
    40% { transform: scale(1); opacity: 1; }
  }

  .chat__input {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--chat-border);
    background: var(--chat-surface);
    flex-shrink: 0;
  }

  .chat__input-field {
    flex: 1;
    border: 1px solid var(--chat-border);
    border-radius: var(--chat-radius-md);
    padding: 10px 14px;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    max-height: 90px;
    min-height: 42px;
    background: var(--chat-surface);
    color: var(--chat-text);
    transition: border-color var(--chat-transition);
  }

  .chat__input-field:focus {
    border-color: var(--chat-primary);
  }

  .chat__input-field:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .chat__input-send {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: var(--chat-primary);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background var(--chat-transition), transform var(--chat-transition);
    font-family: inherit;
    font-size: 16px;
    padding: 0;
    outline: none;
  }

  .chat__input-send:hover {
    background: var(--chat-secondary);
    transform: scale(1.05);
  }

  .chat__input-send:active {
    transform: scale(0.95);
  }

  .chat__input-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .chat__lead-form {
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0.96);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--chat-transition);
  }

  .chat__lead-form--visible {
    opacity: 1;
    pointer-events: auto;
  }

  .chat__lead-form-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--chat-text);
    margin-bottom: 4px;
    text-align: center;
  }

  .chat__lead-form-subtitle {
    font-size: 14px;
    color: var(--chat-text-muted);
    margin-bottom: 20px;
    text-align: center;
  }

  .chat__lead-form-field {
    width: 100%;
    max-width: 280px;
    margin-bottom: 12px;
  }

  .chat__lead-form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--chat-text);
    margin-bottom: 4px;
  }

  .chat__lead-form-input {
    width: 100%;
    border: 1px solid var(--chat-border);
    border-radius: var(--chat-radius-sm);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color var(--chat-transition);
    background: var(--chat-surface);
    color: var(--chat-text);
  }

  .chat__lead-form-input:focus {
    border-color: var(--chat-primary);
  }

  .chat__lead-form-input--error {
    border-color: var(--chat-error);
  }

  .chat__lead-form-error {
    font-size: 12px;
    color: var(--chat-error);
    margin-top: 4px;
    display: none;
  }

  .chat__lead-form-error--visible {
    display: block;
  }

  .chat__lead-form-submit {
    width: 100%;
    max-width: 280px;
    padding: 12px;
    border: none;
    border-radius: var(--chat-radius-sm);
    background: var(--chat-primary);
    color: #fff;
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--chat-transition);
    margin-top: 4px;
  }

  .chat__lead-form-submit:hover {
    background: var(--chat-secondary);
  }

  .chat__lead-form-skip {
    margin-top: 12px;
    font-size: 13px;
    color: var(--chat-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    font-family: inherit;
  }

  .chat__disclaimer {
    padding: 8px 16px;
    font-size: 11px;
    color: var(--chat-text-muted);
    text-align: center;
    border-top: 1px solid var(--chat-border);
    background: var(--chat-surface);
    flex-shrink: 0;
    line-height: 1.4;
  }

  /* Scrollbar styling */
  .chat__messages::-webkit-scrollbar {
    width: 5px;
  }
  .chat__messages::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat__messages::-webkit-scrollbar-thumb {
    background: var(--chat-border);
    border-radius: 3px;
  }

  /* Mobile responsiveness */
  .chat__trigger--left {
    right: auto;
    left: 20px;
  }

  .chat__window--left {
    right: auto;
    left: 20px;
  }

  @media (max-width: 480px) {
    .chat__window {
      right: 10px;
      bottom: 78px;
      width: calc(100vw - 20px);
      height: calc(100vh - 88px);
      max-width: none;
      max-height: none;
      border-radius: var(--chat-radius-md);
    }
    .chat__trigger {
      bottom: 10px;
      right: 10px;
    }
    .chat__trigger--left {
      right: auto;
      left: 10px;
    }
    .chat__window--left {
      right: auto;
      left: 10px;
    }
  }
`;
