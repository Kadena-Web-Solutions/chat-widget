// widget/src/streaming-client.js — SSE streaming client for POST-based chat
import { API_BASE } from './theme-engine.js';

/**
 * Send a chat message via POST and consume the SSE stream.
 *
 * @param {string} clientKey  — client identifier (data-client attribute)
 * @param {string} sessionId  — session token
 * @param {string} message    — user message text
 * @param {function} onChunk  — called with each text delta
 * @param {function} onDone   — called when stream completes
 * @param {function} onError  — called with Error on failure
 * @param {AbortSignal} [signal] — optional AbortSignal for cancellation
 * @param {function} [onSessionToken] — called with server-assigned session token from response header
 */
export function sendMessage(clientKey, sessionId, message, onChunk, onDone, onError, signal, onSessionToken) {
  const url = `${API_BASE}/api/chat/stream`;
  const body = JSON.stringify({ client: clientKey, session: sessionId, message });

  const controller = signal ? null : new AbortController();
  const effectiveSignal = signal || controller?.signal;

  (async () => {
    let retries = 0;
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000;

    while (retries <= MAX_RETRIES) {
      try {
        const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
        if (sessionId) headers['X-Session-Token'] = sessionId;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: effectiveSignal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const serverToken = res.headers.get('X-Session-Token');
        if (serverToken && onSessionToken) onSessionToken(serverToken);

        // Consume SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                onDone();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.conversationId) {
                  // Initial event — ignore, conversationId not needed client-side
                } else if (parsed.content) {
                  onChunk(parsed.content);
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (parseErr) {
                if (data && data !== '[DONE]') {
                  onChunk(data);
                }
              }
            }
          }
        }

        onDone();
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          onDone();
          return;
        }

        retries++;
        if (retries > MAX_RETRIES) {
          onError(err);
          return;
        }

        const delay = BASE_DELAY * Math.pow(2, retries - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    onError(new Error('Max retries exceeded'));
  })();

  return controller ? () => controller.abort() : () => {};
}