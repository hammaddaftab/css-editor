/**
 * preview.js — iframe-based A4 live preview with paged.js
 *
 * Strategy:
 *   Each update builds a complete HTML document string, creates a Blob URL,
 *   and points a hidden <iframe> at it. Inside the iframe, paged.js polyfill
 *   auto-runs, reads @page rules from print.css, and splits content into A4
 *   page boxes — giving a WYSIWYG multi-page preview in the browser.
 *
 *   The iframe's height is expanded after paged.js finishes so the parent
 *   scroll container shows all pages without clipping.
 *
 * Why an iframe + blob URL instead of rendering into the main DOM?
 *   - paged.js polyfill mode rewrites the host page's DOM; isolation prevents
 *     it from affecting the editor UI.
 *   - CSS resets, @page rules, and custom fonts are sandboxed.
 *   - Swapping the blob URL is the fastest way to trigger a full re-render
 *     without keeping paged.js state between updates.
 */

// URLs embedded inside the iframe document must be absolute so the blob
// origin can resolve them.
const PRINT_CSS_URL  = `${location.origin}/static/css/print.css`;
const PAGED_JS_URL   = 'https://unpkg.com/pagedjs/dist/paged.polyfill.js';

let _currentBlobUrl = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the preview with empty content.
 * @param {HTMLIFrameElement} iframe
 */
export function initPreview(iframe) {
  _render(iframe, '', '');
}

/**
 * Update the preview with new HTML body content and optional user CSS.
 *
 * @param {HTMLIFrameElement} iframe
 * @param {string} htmlBody  - rendered HTML fragment (no <html>/<body> wrapper)
 * @param {string} userCss   - additional CSS from the CSS editor
 */
export function updatePreview(iframe, htmlBody, userCss) {
  _render(iframe, htmlBody, userCss);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _render(iframe, htmlBody, userCss) {
  const html = _buildDocument(htmlBody, userCss);
  const blob = new Blob([html], { type: 'text/html' });

  // Revoke the previous blob URL to free memory
  if (_currentBlobUrl) {
    URL.revokeObjectURL(_currentBlobUrl);
  }

  _currentBlobUrl = URL.createObjectURL(blob);

  // Once loaded, resize the iframe to show all paged.js pages
  iframe.onload = () => _resizeIframe(iframe);
  iframe.src = _currentBlobUrl;
}

/**
 * After paged.js finishes paginating, the iframe body grows taller than the
 * viewport. We read scrollHeight and push it back to the parent so the
 * preview scroll container shows everything without clipping.
 */
function _resizeIframe(iframe) {
  try {
    // Give paged.js ~600 ms to finish its DOM surgery, then measure
    setTimeout(() => {
      const doc     = iframe.contentDocument;
      const body    = doc?.body;
      const html    = doc?.documentElement;
      if (!body || !html) return;

      const height  = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
      );

      iframe.style.height = `${height}px`;
    }, 650);
  } catch {
    // Cross-origin guard (shouldn't happen with blob URLs, but be safe)
  }
}

/**
 * Build a complete HTML document that:
 *  1. Loads print.css (shared with WeasyPrint export)
 *  2. Applies user-provided CSS
 *  3. Includes paged.js polyfill (which auto-paginates on DOMContentLoaded)
 */
function _buildDocument(htmlBody, userCss) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Shared document styles (A4 @page, typography) -->
  <link rel="stylesheet" href="${PRINT_CSS_URL}">

  <!-- User custom CSS -->
  <style>
${userCss}
  </style>

  <!--
    paged.js polyfill — reads @page rules and splits the document into
    A4 page boxes rendered as real DOM elements.
    Runs automatically on DOMContentLoaded.
  -->
  <script src="${PAGED_JS_URL}"><\/script>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
