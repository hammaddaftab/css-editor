/**
 * main.js — application entry point
 *
 * Wires together:
 *   - CodeMirror editors  (editor.js)
 *   - SSE client          (sse-client.js)
 *   - Preview iframe      (preview.js)
 *   - Toolbar interactions (CSS toggle, export button, divider drag)
 *
 * Data flow:
 *   User types  →  debounce(400ms)  →  POST /api/render
 *                                           ↓
 *                                   Server renders markdown
 *                                           ↓
 *                                   SSE broadcast → sse:render event
 *                                           ↓
 *                                   updatePreview(iframe, html, css)
 *                                           ↓
 *                                   iframe src = blob URL → paged.js paginates
 */

import { createMarkdownEditor, createCssEditor } from './editor.js';
import { connectSSE }                            from './sse-client.js';
import { initPreview, updatePreview }            from './preview.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $mdEditor    = document.getElementById('md-editor');
const $cssEditor   = document.getElementById('css-editor');
const $frame       = document.getElementById('preview-frame');
const $status      = document.getElementById('sse-status');
const $pageCount   = document.getElementById('page-count');
const $exportBtn   = document.getElementById('export-btn');
const $toggleCss   = document.getElementById('toggle-css');
const $toggleCssInner = document.getElementById('toggle-css-inner');
const $leftPane    = document.getElementById('left-pane');
const $divider     = document.getElementById('pane-divider');
const $panes       = document.querySelector('.panes');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _markdown = '';
let _css      = '';

// ---------------------------------------------------------------------------
// Status helper
// ---------------------------------------------------------------------------
function setStatus(state, label = '') {
  $status.className   = `status status--${state}`;
  $status.title       = label || state;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
async function postRender(markdown, css) {
  setStatus('rendering', 'Rendering…');
  try {
    await fetch('/api/render', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markdown, css }),
    });
    // Preview update arrives via SSE — no need to use the response body here
  } catch (err) {
    setStatus('error', `Render failed: ${err.message}`);
  }
}

async function doExport() {
  $exportBtn.disabled = true;
  $exportBtn.textContent = '⏳ Exporting…';
  try {
    const res = await fetch('/api/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markdown: _markdown, css: _css, filename: 'document' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Trigger browser download
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: 'document.pdf',
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  } finally {
    $exportBtn.disabled    = false;
    $exportBtn.textContent = '⬇ Export PDF';
  }
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------
const mdView = createMarkdownEditor($mdEditor, (text) => {
  _markdown = text;
  postRender(_markdown, _css);
});

const cssView = createCssEditor($cssEditor, (text) => {
  _css = text;
  postRender(_markdown, _css);
});

// Capture initial values from the editors (CM5 API: .getValue())
_markdown = mdView.getValue();
_css      = cssView.getValue();

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------
const sse = connectSSE(window);

window.addEventListener('sse:connected', () => {
  setStatus('connected', 'Live');
  // Push initial render so the preview is populated on first load
  postRender(_markdown, _css);
});

window.addEventListener('sse:render', (ev) => {
  const { html, css } = ev.detail;
  // Use the CSS from the SSE payload if the server has it (file-watch path),
  // otherwise fall back to the current editor CSS.
  updatePreview($frame, html, css || _css);
  setStatus('connected', 'Live');

  // Try to read page count from the iframe after paged.js finishes
  setTimeout(() => {
    try {
      const pages = $frame.contentDocument?.querySelectorAll('.pagedjs_page')?.length ?? 0;
      $pageCount.textContent = pages ? `${pages} page${pages > 1 ? 's' : ''}` : '';
    } catch { /* cross-origin guard */ }
  }, 800);
});

window.addEventListener('sse:error', (ev) => {
  setStatus('error', ev.detail.message);
});

window.addEventListener('sse:offline', () => {
  setStatus('idle', 'Reconnecting…');
});

// ---------------------------------------------------------------------------
// Preview initialisation
// ---------------------------------------------------------------------------
initPreview($frame);

// ---------------------------------------------------------------------------
// Toolbar interactions
// ---------------------------------------------------------------------------

// Export button
$exportBtn.addEventListener('click', doExport);

// CSS panel toggle — wired to both the toolbar button and the inner section header button
function toggleCssPanel() {
  const collapsed = $leftPane.classList.toggle('css-collapsed');
  $toggleCssInner.setAttribute('aria-expanded', String(!collapsed));
  $toggleCss.title       = collapsed ? 'Show CSS panel' : 'Hide CSS panel';
  $toggleCssInner.title  = collapsed ? 'Expand CSS panel' : 'Collapse CSS panel';
}

$toggleCss.addEventListener('click', toggleCssPanel);
$toggleCssInner.addEventListener('click', toggleCssPanel);

// ---------------------------------------------------------------------------
// Resizable divider
// ---------------------------------------------------------------------------
let _dragging    = false;
let _startX      = 0;
let _startColStr = '';

$divider.addEventListener('mousedown', (e) => {
  _dragging    = true;
  _startX      = e.clientX;
  _startColStr = getComputedStyle($panes).gridTemplateColumns;
  $divider.classList.add('dragging');
  document.body.style.cursor   = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!_dragging) return;
  const totalW = $panes.clientWidth - 4; // subtract divider width
  const delta  = e.clientX - _startX;

  // Parse current left fraction from the computed column string
  const parts  = _startColStr.split(' ');
  const leftPx = parseFloat(parts[0]);
  const newLeft = Math.max(200, Math.min(totalW - 200, leftPx + delta));
  const newRight = totalW - newLeft;

  $panes.style.gridTemplateColumns = `${newLeft}px 4px ${newRight}px`;
  _startX = e.clientX;
  _startColStr = $panes.style.gridTemplateColumns;
});

document.addEventListener('mouseup', () => {
  if (!_dragging) return;
  _dragging = false;
  $divider.classList.remove('dragging');
  document.body.style.cursor    = '';
  document.body.style.userSelect = '';
});
