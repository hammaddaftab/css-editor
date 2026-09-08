/**
 * sse-client.js — Server-Sent Events connection manager
 *
 * Connects to /api/events and dispatches typed CustomEvents on the
 * provided target (default: window) so that the rest of the app can
 * listen with addEventListener rather than coupling to this module.
 *
 * Dispatched events:
 *   'sse:connected'          — initial handshake confirmed
 *   'sse:render'  { detail: { html, css } }  — new preview content
 *   'sse:error'   { detail: { message } }    — server-side render error
 *   'sse:offline'                            — connection lost (reconnecting)
 *
 * Auto-reconnects with exponential back-off (max 30 s).
 */

const SSE_URL           = '/api/events';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;

/**
 * Open and manage an SSE connection.
 *
 * @param {EventTarget} [target=window] - where to dispatch CustomEvents
 * @returns {{ close(): void }} - call close() to permanently disconnect
 */
export function connectSSE(target = window) {
  let es          = null;
  let retryDelay  = RECONNECT_BASE_MS;
  let retryTimer  = null;
  let closed      = false;

  function dispatch(name, detail = {}) {
    target.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function connect() {
    es = new EventSource(SSE_URL);

    // ── Handshake ────────────────────────────────────────────────────────
    es.addEventListener('connected', () => {
      retryDelay = RECONNECT_BASE_MS; // reset back-off on successful connect
      dispatch('sse:connected');
    });

    // ── Render event — new HTML + CSS from server ────────────────────────
    es.addEventListener('render', (ev) => {
      const data = JSON.parse(ev.data);
      dispatch('sse:render', { html: data.html ?? '', css: data.css ?? '' });
    });

    // ── Server-side error (e.g. file read failure) ───────────────────────
    es.addEventListener('error', (ev) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:error', { message: data.message ?? 'Unknown error' });
    });

    // ── Transport error / connection lost ────────────────────────────────
    es.onerror = () => {
      es.close();
      if (closed) return;

      dispatch('sse:offline');
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, RECONNECT_MAX_MS);
        connect();
      }, retryDelay);
    };
  }

  connect();

  return {
    close() {
      closed = true;
      clearTimeout(retryTimer);
      es?.close();
    },
  };
}
