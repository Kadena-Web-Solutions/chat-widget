// widget/src/utils.js — Utility functions for the chat widget

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Simple markdown-like formatting: bold (**text** or __text__) and italic (*text* or _text_).
 * @param {string} text
 * @returns {string}
 */
export function formatText(text) {
  if (typeof text !== 'string') return '';
  let html = escapeHTML(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*(.+?)\*(?![*])/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_(.+?)_(?!_)/g, '$1<em>$2</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Generate a random session token using crypto.randomUUID().
 * @returns {string}
 */
export function generateSessionToken() {
  return crypto.randomUUID();
}
