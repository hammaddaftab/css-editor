/**
 * preview.js — double-buffered iframe-based A4 live preview with paged.js
 *
 * Employs a double-buffered architecture (active visible frame vs staging background frame)
 * to ensure that document updates render completely off-screen, eliminating all flashes
 * of unstyled or unloaded content on keystroke/SSE renders.
 *
 * print.css is inlined directly into a <style> tag so that styles are synchronously
 * available when the HTML parser reaches <head>, avoiding forced layout warnings before
 * stylesheets load.
 */

import printCssText from '../../static/css/print.css?raw';

const PAGED_JS_URL = `${location.origin}/static/vendor/paged.polyfill.js`;

let _frameA = null;
let _frameB = null;
let _singleFrame = null;
let _scrollEl = null;

let _activeFrameName = 'A'; // 'A' or 'B'
let _currentTheme = 'light';
let _currentDocToken = '';
let _currentRenderId = 0;

let _activeBlobUrls = { A: null, B: null, single: null };
let _stagingBlobUrl = null;

let _pendingFallbackTimer = null;
let _onPageCountCallback = null;
let _onSwapCallback = null;
let _hasRendered = false;
let _messageListenerAttached = false;

function _ensureMessageListener() {
  if (_messageListenerAttached || typeof window === 'undefined') return;
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'pagedjs:ready') {
      const { renderId, pageCount, height } = event.data;
      if (renderId === _currentRenderId) {
        if (_frameA && _frameB) {
          if (_stagingBlobUrl === null && _activeFrameName === 'A') {
            if (_frameA && height > 0) _frameA.style.height = `${height}px`;
            if (_onPageCountCallback) {
              _onPageCountCallback(pageCount ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : '');
            }
          } else {
            _performSwap(renderId, pageCount, height);
          }
        } else if (_singleFrame) {
          _performSingleFrameReady(renderId, pageCount, height);
        }
      }
    }
  });
  _messageListenerAttached = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setPreviewDocumentTheme(targetOrTheme, theme) {
  const nextTheme = typeof targetOrTheme === 'string' ? targetOrTheme : (theme || 'light');
  _currentTheme = nextTheme;

  const frames = [];
  if (_frameA) frames.push(_frameA);
  if (_frameB) frames.push(_frameB);
  if (_singleFrame) frames.push(_singleFrame);
  if (targetOrTheme && (targetOrTheme instanceof HTMLIFrameElement || targetOrTheme.tagName === 'IFRAME')) {
    frames.push(targetOrTheme);
  }

  for (const frame of frames) {
    try {
      const doc = frame.contentDocument;
      if (doc?.documentElement) {
        doc.documentElement.setAttribute('data-theme', nextTheme);
      }
    } catch { /* cross-origin guard */ }
  }
}

/**
 * @param {any} target
 * @param {string} [theme]
 * @param {((count: string) => void) | null} [onPageCount]
 * @param {((active: 'A' | 'B') => void) | null} [onSwap]
 */
export function initPreview(target, theme = 'light', onPageCount = undefined, onSwap = undefined) {
  _ensureMessageListener();
  _currentTheme = theme || 'light';
  if (onPageCount) _onPageCountCallback = onPageCount;

  if (target && target.frameA && target.frameB) {
    _frameA = target.frameA;
    _frameB = target.frameB;
    _scrollEl = target.scrollEl || null;
    if (target.onSwap) _onSwapCallback = target.onSwap;
    else if (onSwap) _onSwapCallback = onSwap;
    _activeFrameName = 'A';
    _hasRendered = false;
    return;
  }

  if (target && (target instanceof HTMLIFrameElement || target.tagName === 'IFRAME')) {
    _singleFrame = target;
    _renderSingleFrame(_singleFrame, '', '', _currentTheme, _currentDocToken);
  }
}

/**
 * @param {any} targetOrHtml
 * @param {string} [htmlOrCss]
 * @param {string} [userCss]
 * @param {string} [theme]
 * @param {string|((count: string) => void)} [docToken]
 * @param {((count: string) => void)} [onPageCount]
 */
export function updatePreview(targetOrHtml, htmlOrCss, userCss, theme, docToken, onPageCount) {
  _ensureMessageListener();

  let htmlBody = '';
  let css = '';
  let th = _currentTheme;
  let tok = _currentDocToken;

  if (typeof targetOrHtml === 'string') {
    htmlBody = targetOrHtml;
    css = typeof htmlOrCss === 'string' ? htmlOrCss : '';
    th = typeof userCss === 'string' ? userCss : _currentTheme;
    tok = typeof theme === 'string' ? theme : _currentDocToken;
    if (typeof docToken === 'function') _onPageCountCallback = docToken;
    else if (typeof onPageCount === 'function') _onPageCountCallback = onPageCount;
  } else {
    htmlBody = typeof htmlOrCss === 'string' ? htmlOrCss : '';
    css = typeof userCss === 'string' ? userCss : '';
    th = typeof theme === 'string' ? theme : _currentTheme;
    tok = typeof docToken === 'string' ? docToken : _currentDocToken;
    if (typeof onPageCount === 'function') _onPageCountCallback = onPageCount;

    if (targetOrHtml && targetOrHtml.frameA && targetOrHtml.frameB) {
      _frameA = targetOrHtml.frameA;
      _frameB = targetOrHtml.frameB;
      if (targetOrHtml.scrollEl) _scrollEl = targetOrHtml.scrollEl;
      if (targetOrHtml.onSwap) _onSwapCallback = targetOrHtml.onSwap;
    } else if (targetOrHtml && (targetOrHtml instanceof HTMLIFrameElement || targetOrHtml.tagName === 'IFRAME')) {
      _singleFrame = targetOrHtml;
    }
  }

  _currentTheme = th || 'light';
  _currentDocToken = tok || '';

  if (_frameA && _frameB) {
    if (!_hasRendered) {
      _hasRendered = true;
      _renderFrameDirect(_frameA, htmlBody, css, _currentTheme, _currentDocToken, 'A');
    } else {
      _renderDoubleBuffered(htmlBody, css, _currentTheme, _currentDocToken);
    }
  } else if (_singleFrame) {
    _renderSingleFrame(_singleFrame, htmlBody, css, _currentTheme, _currentDocToken);
  }
}

// ---------------------------------------------------------------------------
// Double-Buffering Implementation
// ---------------------------------------------------------------------------

function _renderDoubleBuffered(htmlBody, userCss, theme, docToken) {
  const renderId = ++_currentRenderId;
  const stagingName = _activeFrameName === 'A' ? 'B' : 'A';
  const stagingFrame = stagingName === 'A' ? _frameA : _frameB;

  if (!stagingFrame) return;

  const html = _buildDocument(htmlBody, userCss, theme, docToken, renderId);
  const blob = new Blob([html], { type: 'text/html' });

  _stagingBlobUrl = URL.createObjectURL(blob);

  if (_pendingFallbackTimer) clearTimeout(_pendingFallbackTimer);
  _pendingFallbackTimer = setTimeout(() => {
    if (_currentRenderId === renderId) {
      _performSwap(renderId);
    }
  }, 1500);

  stagingFrame.onload = () => {
    setTimeout(() => {
      if (_currentRenderId === renderId && stagingFrame.classList.contains('preview-frame--staging')) {
        _performSwap(renderId);
      }
    }, 800);
  };

  stagingFrame.src = _stagingBlobUrl;
}

function _performSwap(renderId, pageCount, height) {
  if (renderId !== _currentRenderId) return;

  if (_pendingFallbackTimer) {
    clearTimeout(_pendingFallbackTimer);
    _pendingFallbackTimer = null;
  }

  const activeName = _activeFrameName;
  const stagingName = activeName === 'A' ? 'B' : 'A';
  const activeFrame = activeName === 'A' ? _frameA : _frameB;
  const stagingFrame = stagingName === 'A' ? _frameA : _frameB;

  if (!activeFrame || !stagingFrame) return;

  let finalHeight = height;
  if (!finalHeight || finalHeight <= 0) {
    try {
      const doc = stagingFrame.contentDocument;
      const pagesEl = doc?.querySelector('.pagedjs_pages');
      finalHeight = pagesEl ? (pagesEl.offsetHeight + 48) : Math.max(
        doc?.body?.scrollHeight || 0,
        doc?.documentElement?.scrollHeight || 0,
      );
    } catch { /* cross-origin guard */ }
  }

  if (finalHeight && finalHeight > 0) {
    stagingFrame.style.height = `${finalHeight}px`;
  }

  const savedScrollTop = _scrollEl ? _scrollEl.scrollTop : null;

  stagingFrame.classList.remove('preview-frame--staging');
  stagingFrame.classList.add('preview-frame--visible');

  activeFrame.classList.remove('preview-frame--visible');
  activeFrame.classList.add('preview-frame--staging');

  if (savedScrollTop !== null && _scrollEl) {
    _scrollEl.scrollTop = savedScrollTop;
  }

  if (_activeBlobUrls[activeName]) {
    URL.revokeObjectURL(_activeBlobUrls[activeName]);
    _activeBlobUrls[activeName] = null;
  }
  _activeBlobUrls[stagingName] = _stagingBlobUrl;
  _stagingBlobUrl = null;

  _activeFrameName = stagingName;
  if (_onSwapCallback) {
    _onSwapCallback(stagingName);
  }

  let count = pageCount;
  if (count === undefined) {
    try {
      count = stagingFrame.contentDocument?.querySelectorAll('.pagedjs_page').length || 0;
    } catch { count = 0; }
  }
  if (_onPageCountCallback) {
    _onPageCountCallback(count ? `${count} page${count > 1 ? 's' : ''}` : '');
  }
}

// ---------------------------------------------------------------------------
// Single Frame Fallback
// ---------------------------------------------------------------------------

function _renderFrameDirect(frame, htmlBody, userCss, theme, docToken, key) {
  const renderId = ++_currentRenderId;
  const html = _buildDocument(htmlBody, userCss, theme, docToken, renderId);
  const blob = new Blob([html], { type: 'text/html' });

  if (_activeBlobUrls[key]) {
    URL.revokeObjectURL(_activeBlobUrls[key]);
  }
  const url = URL.createObjectURL(blob);
  _activeBlobUrls[key] = url;

  frame.onload = () => {
    setTimeout(() => {
      try {
        const doc = frame.contentDocument;
        const pagesEl = doc?.querySelector('.pagedjs_pages');
        const height = pagesEl ? (pagesEl.offsetHeight + 48) : Math.max(
          doc?.body?.scrollHeight || 0,
          doc?.documentElement?.scrollHeight || 0,
        );
        if (height > 0) frame.style.height = `${height}px`;
      } catch { /* cross-origin guard */ }
    }, 650);
  };
  frame.src = url;
}

function _renderSingleFrame(frame, htmlBody, userCss, theme, docToken) {
  const renderId = ++_currentRenderId;
  const html = _buildDocument(htmlBody, userCss, theme, docToken, renderId);
  const blob = new Blob([html], { type: 'text/html' });

  if (_activeBlobUrls.single) {
    URL.revokeObjectURL(_activeBlobUrls.single);
  }
  _activeBlobUrls.single = URL.createObjectURL(blob);

  if (_pendingFallbackTimer) clearTimeout(_pendingFallbackTimer);
  _pendingFallbackTimer = setTimeout(() => {
    if (_currentRenderId === renderId) {
      _performSingleFrameReady(renderId);
    }
  }, 1500);

  frame.onload = () => {
    setTimeout(() => {
      if (_currentRenderId === renderId) {
        _performSingleFrameReady(renderId);
      }
    }, 650);
  };

  frame.src = _activeBlobUrls.single;
}

function _performSingleFrameReady(renderId, pageCount, height) {
  if (renderId !== _currentRenderId || !_singleFrame) return;
  if (_pendingFallbackTimer) {
    clearTimeout(_pendingFallbackTimer);
    _pendingFallbackTimer = null;
  }

  let finalHeight = height;
  if (!finalHeight || finalHeight <= 0) {
    try {
      const doc = _singleFrame.contentDocument;
      const pagesEl = doc?.querySelector('.pagedjs_pages');
      finalHeight = pagesEl ? (pagesEl.offsetHeight + 48) : Math.max(
        doc?.body?.scrollHeight || 0,
        doc?.documentElement?.scrollHeight || 0,
      );
    } catch { /* cross-origin guard */ }
  }

  if (finalHeight && finalHeight > 0) {
    _singleFrame.style.height = `${finalHeight}px`;
  }

  let count = pageCount;
  if (count === undefined) {
    try {
      count = _singleFrame.contentDocument?.querySelectorAll('.pagedjs_page').length || 0;
    } catch { count = 0; }
  }
  if (_onPageCountCallback) {
    _onPageCountCallback(count ? `${count} page${count > 1 ? 's' : ''}` : '');
  }
}

// ---------------------------------------------------------------------------
// Document Template Generation
// ---------------------------------------------------------------------------

function _buildDocument(htmlBody, userCss, theme = 'light', docToken = '', renderId = 0) {
  const baseHref = docToken ? `${location.origin}/api/assets/${docToken}/` : `${location.origin}/`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">

  <base href="${baseHref}">

  <style id="base-print-css">
${printCssText}
  </style>

  <style id="base-theme-css">
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

  <script>
    window.PagedConfig = {
      auto: true,
      after: function(flow) {
        try {
          var count = (flow && flow.pages) ? flow.pages.length : (flow && flow.total) ? flow.total : (document.querySelectorAll('.pagedjs_page').length || 0);
          var pagesEl = document.querySelector('.pagedjs_pages');
          var h = pagesEl ? (pagesEl.offsetHeight + 48) : Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.body ? document.body.offsetHeight : 0,
            document.documentElement ? document.documentElement.clientHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0,
            document.documentElement ? document.documentElement.offsetHeight : 0
          );
          window.parent.postMessage({
            type: 'pagedjs:ready',
            renderId: ${renderId},
            pageCount: count,
            height: h
          }, '*');
        } catch (e) {
          console.warn('PagedConfig.after error:', e);
        }
      }
    };
  </script>
  <script src="${PAGED_JS_URL}"></script>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
