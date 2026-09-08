/**
 * sse-client.js — Server-Sent Events connection manager
 *
 * Dispatches typed CustomEvents on the provided target (default: window)
 * so the rest of the app can listen with addEventListener.
 *
 * Events dispatched:
 *   'sse:connected'
 *   'sse:render'   { detail: { html, css } }
 *   'sse:error'    { detail: { message } }
 *   'sse:offline'
 *
 * Auto-reconnects with exponential back-off (max 30 s).
 */

const SSE_URL           = '/api/events';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;

export function connectSSE(target = window) {
  let es         = null;
  let retryDelay = RECONNECT_BASE_MS;
  let retryTimer = null;
  let closed     = false;

  function dispatch(name, detail = {}) {
    target.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function connect() {
    es = new EventSource(SSE_URL);

    es.addEventListener('connected', () => {
      retryDelay = RECONNECT_BASE_MS;
      dispatch('sse:connected');
    });

    es.addEventListener('render', (ev) => {
      const data = JSON.parse(ev.data);
      dispatch('sse:render', { html: data.html ?? '', css: data.css ?? '' });
    });

    es.addEventListener('error', (ev) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:error', { message: data.message ?? 'Unknown error' });
    });

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
  return { close() { closed = true; clearTimeout(retryTimer); es?.close(); } };
}
