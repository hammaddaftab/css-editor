/**
 * sse-client.ts — Server-Sent Events connection manager
 *
 * Dispatches typed CustomEvents on the provided target (default: window)
 * so the rest of the app can listen with addEventListener.
 *
 * Events dispatched:
 *   'sse:connected'
 *   'sse:render'         { detail: { html, css, ... } }
 *   'sse:file:change'    { detail: { ... } }
 *   'sse:document:change'{ detail: { ... } }
 *   'sse:file:list'      { detail: { ... } }
 *   'sse:error'          { detail: { message } }
 *   'sse:offline'
 *
 * Auto-reconnects with exponential back-off (max 30 s).
 */

export interface SSERenderData {
  html: string;
  css: string;
  filename?: string;
  project?: string;
  project_css?: string;
  doc_token?: string;
  doc_path?: string;
  [key: string]: unknown;
}

export interface SSEErrorData {
  message: string;
}

export interface SSEConnectionHandle {
  close(): void;
}

const SSE_URL = '/api/events';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function connectSSE(target: EventTarget = window): SSEConnectionHandle {
  let es: EventSource | null = null;
  let retryDelay = RECONNECT_BASE_MS;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function dispatch(name: string, detail: unknown = {}): void {
    target.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function connect(): void {
    es = new EventSource(SSE_URL);

    es.addEventListener('connected', () => {
      retryDelay = RECONNECT_BASE_MS;
      dispatch('sse:connected');
    });

    es.addEventListener('render', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data || '{}');
      dispatch('sse:render', {
        html: data.html ?? '',
        css: data.css ?? '',
        filename: data.filename,
        project: data.project,
        project_css: data.project_css,
        doc_token: data.doc_token,
        doc_path: data.doc_path,
        ...data,
      });
    });

    es.addEventListener('file:change', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:file:change', data);
    });

    es.addEventListener('document:change', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:document:change', data);
    });

    es.addEventListener('file:list', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:file:list', data);
    });

    es.addEventListener('error', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data ?? '{}');
      dispatch('sse:error', { message: data.message ?? 'Unknown error' });
    });

    es.onerror = () => {
      es?.close();
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
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    },
  };
}
