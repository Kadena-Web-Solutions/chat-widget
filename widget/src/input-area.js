// widget/src/input-area.js — Textarea + send button composition

/**
 * Initialize the input area: auto-resize textarea, send on Enter,
 * and send button click handler.
 *
 * @param {ShadowRoot} shadowRoot
 * @param {{ onSend: function(string): void, getDisabled: function(): boolean }} opts
 * @returns {function} Cleanup function to remove event listeners
 */
export function initInputArea(shadowRoot, { onSend, getDisabled }) {
  const textarea = shadowRoot.querySelector('.chat__input-field');
  const sendBtn = shadowRoot.querySelector('.chat__input-send');

  if (!textarea || !sendBtn) return () => {};

  function handleSend() {
    if (getDisabled()) return;
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    resetTextareaHeight();
    onSend(text);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    autoResize();
    updateSendButtonState();
  }

  function autoResize() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 90) + 'px';
  }

  function resetTextareaHeight() {
    textarea.style.height = '';
  }

  function updateSendButtonState() {
    sendBtn.disabled = getDisabled() || textarea.value.trim().length === 0;
  }

  textarea.addEventListener('keydown', handleKeydown);
  textarea.addEventListener('input', handleInput);
  sendBtn.addEventListener('click', handleSend);

  // Initial state
  updateSendButtonState();

  return () => {
    textarea.removeEventListener('keydown', handleKeydown);
    textarea.removeEventListener('input', handleInput);
    sendBtn.removeEventListener('click', handleSend);
  };
}