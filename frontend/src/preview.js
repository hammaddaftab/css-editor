/**
 * preview.js — iframe-based A4 live preview with paged.js
 *
 * Each update builds a full HTML document, wraps it in a Blob URL, and
 * points a sandboxed <iframe> at it. paged.js polyfill runs inside the
 * iframe and splits the content into A4 page boxes — giving a WYSIWYG
 * multi-page preview in the browser.
 *
 * The iframe is isolated so paged.js can freely rewrite its DOM without
 * touching the editor UI.
 */

const PRINT_CSS_URL = `${location.origin}/static/css/print.css`;
const PAGED_JS_URL  = 'https://unpkg.com/pagedjs/dist/paged.polyfill.js';

let _currentBlobUrl = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initPreview(iframe) {
  _render(iframe, '', '');
}

export function updatePreview(iframe, htmlBody, userCss) {
  _render(iframe, htmlBody, userCss);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _render(iframe, htmlBody, userCss) {
  const html = _buildDocument(htmlBody, userCss);
  const blob = new Blob([html], { type: 'text/html' });

  if (_currentBlobUrl) URL.revokeObjectURL(_currentBlobUrl);
  _currentBlobUrl = URL.createObjectURL(blob);

  iframe.onload = () => _resizeIframe(iframe);
  iframe.src    = _currentBlobUrl;
}

function _resizeIframe(iframe) {
  // Give paged.js time to finish its DOM work, then stretch the iframe
  setTimeout(() => {
    try {
      const doc  = iframe.contentDocument;
      const body = doc?.body;
      const html = doc?.documentElement;
      if (!body || !html) return;

      const height = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight,
      );
      iframe.style.height = `${height}px`;
    } catch { /* cross-origin guard */ }
  }, 650);
}

function _buildDocument(htmlBody, userCss) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <!--
    <base href> is the key fix for image rendering inside the iframe.

    The iframe loads from a blob: URL (e.g. blob:http://localhost:8000/uuid).
    Without a base, any image path is resolved relative to that blob URL —
    which means relative paths (./img.png) and root-relative paths
    (/static/images/img.png) silently fail.

    Setting base href to the server origin means:
      ![alt](https://example.com/img.png)  → unchanged  ✓
      ![alt](/static/images/img.png)       → http://localhost:8000/static/images/img.png  ✓
      ![alt](img.png)                      → http://localhost:8000/img.png  ✓
      data:image/...                       → unchanged  ✓
  -->
  <base href="${location.origin}/">

  <link rel="stylesheet" href="${PRINT_CSS_URL}">
  <style>${userCss}</style>
  <script src="${PAGED_JS_URL}"><\/script>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
