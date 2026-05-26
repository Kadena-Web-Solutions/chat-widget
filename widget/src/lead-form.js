// widget/src/lead-form.js — Lead capture overlay form

import { escapeHTML } from './utils.js';

/**
 * Initialize the lead capture form.
 *
 * @param {ShadowRoot} shadowRoot
 * @param {{ config: object, onSubmit: function({name:string, email:string, phone:string}): void, onSkip: function(): void }} opts
 * @returns {function} Cleanup function
 */
export function initLeadForm(shadowRoot, { config, onSubmit, onSkip }) {
  const form = shadowRoot.querySelector('.chat__lead-form');
  if (!form) return () => {};

  // Set titles from config
  const titleEl = form.querySelector('.chat__lead-form-title');
  const subtitleEl = form.querySelector('.chat__lead-form-subtitle');
  if (titleEl) titleEl.textContent = config.leadFormTitle || 'Get in Touch';
  if (subtitleEl) subtitleEl.textContent = config.leadFormSubtitle || 'Leave your details and we will reach out.';

  const submitBtn = form.querySelector('.chat__lead-form-submit');
  const skipBtn = form.querySelector('.chat__lead-form-skip');

  const nameInput = form.querySelector('input[name="name"]');
  const emailInput = form.querySelector('input[name="email"]');
  const phoneInput = form.querySelector('input[name="phone"]');

  /**
   * Show the lead form overlay.
   */
  function show() {
    form.classList.add('chat__lead-form--visible');
    if (nameInput) nameInput.focus();
  }

  /**
   * Hide the lead form overlay.
   */
  function hide() {
    form.classList.remove('chat__lead-form--visible');
    clearErrors();
  }

  /**
   * Validate an email address.
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Clear all validation error states.
   */
  function clearErrors() {
    const inputs = form.querySelectorAll('.chat__lead-form-input');
    inputs.forEach((input) => input.classList.remove('chat__lead-form-input--error'));
    const errors = form.querySelectorAll('.chat__lead-form-error');
    errors.forEach((err) => err.classList.remove('chat__lead-form-error--visible'));
  }

  /**
   * Show a validation error on a specific field.
   * @param {HTMLInputElement} input
   */
  function showError(input) {
    input.classList.add('chat__lead-form-input--error');
    const field = input.closest('.chat__lead-form-field');
    if (field) {
      const err = field.querySelector('.chat__lead-form-error');
      if (err) err.classList.add('chat__lead-form-error--visible');
    }
  }

  /**
   * Handle form submission.
   */
  function handleSubmit() {
    clearErrors();
    let valid = true;

    const name = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim();
    const phone = (phoneInput?.value || '').trim();

    if (!name && nameInput) {
      showError(nameInput);
      valid = false;
    }

    if (!email || !isValidEmail(email)) {
      if (emailInput) showError(emailInput);
      valid = false;
    }

    if (!valid) return;

    // Submit lead data
    onSubmit({ name: escapeHTML(name), email: escapeHTML(email), phone: escapeHTML(phone) });
    hide();
  }

  /**
   * Handle skip button.
   */
  function handleSkip() {
    hide();
    if (onSkip) onSkip();
  }

  // Bind events
  if (submitBtn) submitBtn.addEventListener('click', handleSubmit);
  if (skipBtn) skipBtn.addEventListener('click', handleSkip);

  // Enter key in form fields submits the form
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && form.classList.contains('chat__lead-form--visible')) {
      e.preventDefault();
      handleSubmit();
    }
  });

  return () => {
    if (submitBtn) submitBtn.removeEventListener('click', handleSubmit);
    if (skipBtn) skipBtn.removeEventListener('click', handleSkip);
  };
}

/**
 * Show the lead form overlay.
 * @param {ShadowRoot} shadowRoot
 */
export function showLeadForm(shadowRoot) {
  const form = shadowRoot.querySelector('.chat__lead-form');
  if (form) {
    form.classList.add('chat__lead-form--visible');
    const nameInput = form.querySelector('input[name="name"]');
    if (nameInput) nameInput.focus();
  }
}

/**
 * Hide the lead form overlay.
 * @param {ShadowRoot} shadowRoot
 */
export function hideLeadForm(shadowRoot) {
  const form = shadowRoot.querySelector('.chat__lead-form');
  if (form) form.classList.remove('chat__lead-form--visible');
}