/**
 * Cloudflare Turnstile Verification
 *
 * Verifies client-side Turnstile CAPTCHA tokens via the Cloudflare
 * siteverify endpoint. Provides defense against automated spam/bots
 * on chat endpoints.
 *
 * Verification flow:
 *   1. Client completes Turnstile widget → receives token
 *   2. Token sent to Worker (JSON body or query param)
 *   3. Worker POSTs token to Cloudflare verification endpoint
 *   4. On success → proceed; on failure → reject with error
 *
 * Dev mode: If TURNSTILE_SECRET_KEY is not configured, verification
 * is skipped (returns success=true) for local development.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// ─── Token Extraction ──────────────────────────────────────────────────────────

/**
 * Extract a Turnstile token from the incoming request.
 * Checks the request body first (JSON: { turnstileToken: "..." }),
 * then falls back to query parameter (?turnstile=...).
 *
 * Uses request.clone() to avoid consuming the original body stream.
 *
 * @param {Request} request - Incoming HTTP request
 * @returns {Promise<string|null>} Token string or null if not found
 */
export async function extractTurnstileToken(request) {
  // Try query param first (cheapest, doesn't consume body)
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('turnstile');
  if (queryToken) return queryToken;

  // Try request body — clone to preserve original for downstream handlers
  try {
    const cloned = request.clone();
    const body = await cloned.json();
    return body?.turnstileToken || null;
  } catch {
    // Body is not JSON, empty, or already consumed — non-fatal
    return null;
  }
}

// ─── Verification ──────────────────────────────────────────────────────────────

/**
 * Verify a Turnstile CAPTCHA token against Cloudflare's verification endpoint.
 *
 * If env.TURNSTILE_SECRET_KEY is not set, verification is skipped (dev mode)
 * and the function returns { success: true }.
 *
 * Network errors during verification are logged as warnings and result in
 * { success: false } — the caller should treat these as verification failures.
 *
 * @param {string} token - The Turnstile token from the client
 * @param {Object} env - Worker bindings (must contain TURNSTILE_SECRET_KEY)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function verifyTurnstile(token, env) {
  // Dev mode — no secret key configured, skip verification
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn('⚠️  Turnstile secret key not configured — skipping verification (dev mode)');
    return { success: true };
  }

  // Require a token
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { success: false, error: 'Turnstile token is required' };
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token.trim(),
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️  Turnstile verification endpoint returned ${response.status}`);
      return { success: false, error: `Verification service error (${response.status})` };
    }

    const result = await response.json();

    if (result.success) {
      return { success: true };
    }

    // Collect specific error codes from Cloudflare response
    const errorCodes = result['error-codes'] || [];
    const errorMsg = errorCodes.length > 0
      ? `Verification failed: ${errorCodes.join(', ')}`
      : 'Verification failed';

    return { success: false, error: errorMsg };

  } catch (err) {
    // Network errors (timeout, DNS failure, etc.) — log and reject
    console.warn('⚠️  Turnstile verification network error:', err.message || err);
    return { success: false, error: 'Verification service unavailable' };
  }
}
