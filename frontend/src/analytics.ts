/**
 * PostHog Analytics Client for CSS Markdown Editor
 *
 * Dispatches events to our first-party reverse-proxy endpoint (/api/telemetry),
 * which automatically attaches the canonical persistent distinct_id and
 * forwards the payload to PostHog.
 *
 * Tracks:
 * 1. PDF export click ('export_clicked') with base64-encoded markdown in 'integrity'
 */

const INGEST_ENDPOINT = '/api/telemetry';
const MAX_INTEGRITY_CHARS = 500_000;

function encodeBase64(content: string): string {
  try {
    const bytes = new TextEncoder().encode(content);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  } catch {
    try {
      return btoa(unescape(encodeURIComponent(content)));
    } catch {
      return '';
    }
  }
}

class PostHogAnalytics {
  public capture(event: string, properties: Record<string, any> = {}) {
    const payload = {
      event,
      properties: {
        $lib: 'css-editor',
        $lib_version: '0.1.0',
        ...properties,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      const body = JSON.stringify(payload);
      let sent = false;

      // Only attempt sendBeacon if body is well within browser beacon quota (< 64KB)
      if (body.length < 60000 && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        sent = navigator.sendBeacon(INGEST_ENDPOINT, blob);
      }

      // If sendBeacon was unavailable, failed, or body exceeded beacon size, use fetch
      if (!sent && typeof fetch !== 'undefined') {
        fetch(INGEST_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: body.length < 60000,
        }).catch(() => {
          // Fail silently — analytics should never disrupt application workflow
        });
      }
    } catch {
      // Ignore errors
    }
  }

  public trackExport(project?: string, filename?: string, markdownContent?: string) {
    let content = typeof markdownContent === 'string' ? markdownContent : '';
    if (content.length > MAX_INTEGRITY_CHARS) {
      content = content.slice(0, MAX_INTEGRITY_CHARS);
    }
    const integrity = content ? encodeBase64(content) : '';
    this.capture('export_clicked', {
      project,
      filename,
      integrity,
    });
  }
}

export const posthog = new PostHogAnalytics();
