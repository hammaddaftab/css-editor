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
const PAGED_JS_URL  = `${location.origin}/static/vendor/paged.polyfill.js`;

let _currentBlobUrl = null;
let _currentTheme   = 'light';
let _currentDocToken = '';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setPreviewDocumentTheme(iframe, theme) {
  _currentTheme = theme;
  try {
    const doc = iframe.contentDocument;
    if (doc?.documentElement) {
      doc.documentElement.setAttribute('data-theme', theme);
    }
  } catch { /* cross-origin guard */ }
}

export function initPreview(iframe, theme = 'light') {
  _currentTheme = theme;
  _render(iframe, '', '', _currentTheme, _currentDocToken);
}

export function updatePreview(iframe, htmlBody, userCss, theme = _currentTheme, docToken = _currentDocToken) {
  if (theme) _currentTheme = theme;
  if (docToken !== undefined) _currentDocToken = docToken;
  _render(iframe, htmlBody, userCss, _currentTheme, _currentDocToken);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _render(iframe, htmlBody, userCss, theme = _currentTheme, docToken = _currentDocToken) {
  const html = _buildDocument(htmlBody, userCss, theme, docToken);
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

function _buildDocument(htmlBody, userCss, theme = 'light', docToken = '') {
  const baseHref = docToken ? `${location.origin}/api/assets/${docToken}/` : `${location.origin}/`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">

  <base href="${baseHref}">

  <link rel="stylesheet" href="${PRINT_CSS_URL}">
  <style>
    html, body {
      background: transparent !important;
    }
    .pagedjs_pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 16px 0;
    }

    /* ── Light Page Theme (Default) ── */
    .pagedjs_page {
      background: #ffffff !important;
      color: var(--color-text, #1a1a1a);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.08) !important;
      transition: background 150ms ease, color 150ms ease;
    }

    /* ── Dark Page Theme ── */
    html[data-theme="dark"] {
      --color-text:              #e5e7eb;
      --color-heading:           #ffffff;
      --color-link:              #60a5fa;
      --color-border:            #374151;
      --color-muted:             #9ca3af;
      --color-code-bg:           #26262b;
      --color-blockquote-border: #4b5563;
      color: #e5e7eb;
    }

    html[data-theme="dark"] body {
      color: #e5e7eb !important;
    }

    html[data-theme="dark"] .pagedjs_page {
      background: #1c1c1f !important;
      color: #e5e7eb !important;
      box-shadow: 0 4px 22px rgba(0, 0, 0, 0.65), 0 0 0 1px #2e2e34 !important;
    }

    html[data-theme="dark"] h1,
    html[data-theme="dark"] h2,
    html[data-theme="dark"] h3,
    html[data-theme="dark"] h4,
    html[data-theme="dark"] h5,
    html[data-theme="dark"] h6 {
      color: #ffffff !important;
    }

    html[data-theme="dark"] h1 {
      border-bottom-color: #ffffff !important;
    }

    html[data-theme="dark"] h2 {
      border-bottom-color: #374151 !important;
    }

    html[data-theme="dark"] a {
      color: #60a5fa !important;
    }

    html[data-theme="dark"] hr {
      border-top-color: #374151 !important;
    }

    html[data-theme="dark"] table thead tr {
      background: #27272c !important;
    }

    html[data-theme="dark"] table tr:nth-child(even) td {
      background: #212126 !important;
    }

    html[data-theme="dark"] table th,
    html[data-theme="dark"] table td {
      border-color: #374151 !important;
      color: #e5e7eb !important;
    }

    html[data-theme="dark"] pre,
    html[data-theme="dark"] pre.code-block {
      background: #25252a !important;
      border-color: #374151 !important;
      border-left-color: var(--accent, #2563eb) !important;
      color: #f3f4f6 !important;
    }

    html[data-theme="dark"] code {
      background: #27272c !important;
      color: #f3f4f6 !important;
    }

    html[data-theme="dark"] blockquote {
      border-left-color: #4b5563 !important;
      color: #9ca3af !important;
    }

    html[data-theme="dark"] .callout {
      background: #212126 !important;
      border-color: #374151 !important;
      border-left-color: var(--accent, #2563eb) !important;
    }

    html[data-theme="dark"] .warning {
      background: #361414 !important;
      border-left-color: #ef4444 !important;
      color: #fca5a5 !important;
    }

    html[data-theme="dark"] .info,
    html[data-theme="dark"] .note {
      background: #14223d !important;
      border-left-color: #3b82f6 !important;
      color: #93c5fd !important;
    }

    html[data-theme="dark"] .badge {
      background: #374151 !important;
      color: #f3f4f6 !important;
    }

    html[data-theme="dark"] .badge-info {
      background: #1e3a8a !important;
      color: #bfdbfe !important;
    }

    html[data-theme="dark"] .badge-warning {
      background: #7f1d1d !important;
      color: #fecaca !important;
    }

    ${userCss}
  </style>
  <script src="${PAGED_JS_URL}"><\/script>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
