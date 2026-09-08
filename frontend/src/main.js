/**
 * main.js — application entry point
 *
 * Wires together editors, SSE client, and the preview iframe.
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
 *                                   iframe.src = Blob URL → paged.js
 */

import { createMarkdownEditor, createCssEditor } from './editor.js';
import { connectSSE }                            from './sse-client.js';
import { initPreview, updatePreview, setPreviewDocumentTheme } from './preview.js';
import { initImageLibrary }                      from './image-library.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $mdEditor         = document.getElementById('md-editor');
const $cssEditor        = document.getElementById('css-editor');
const $frame            = document.getElementById('preview-frame');
const $status           = document.getElementById('sse-status');
const $pageCount        = document.getElementById('page-count');
const $exportBtn        = document.getElementById('export-btn');
const $toggleLibrary    = document.getElementById('toggle-library');
const $imageLibrary     = document.getElementById('image-library');
const $imageList        = document.getElementById('image-list');
const $libraryDropzone  = document.getElementById('library-dropzone');
const $uploadLibraryBtn = document.getElementById('upload-library-btn');
const $imageCount       = document.getElementById('image-count');
const $imageInput       = document.getElementById('image-input');
const $toggleCss        = document.getElementById('toggle-css');
const $toggleCssInner   = document.getElementById('toggle-css-inner');
const $leftPane         = document.getElementById('left-pane');
const $divider          = document.getElementById('pane-divider');
const $panes            = document.querySelector('.panes');
const $previewScroll    = document.querySelector('.preview-scroll');
const $previewThemeToggle = document.getElementById('preview-theme-toggle');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _markdown = '';
let _css      = '';
let _previewTheme = localStorage.getItem('css_editor_preview_theme') || 'light';

// ---------------------------------------------------------------------------
// Status helper
// ---------------------------------------------------------------------------
function setStatus(state, label = '') {
  $status.className = `status status--${state}`;
  $status.title     = label || state;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function postRender(markdown, css) {
  setStatus('rendering', 'Rendering…');
  try {
    await fetch('/api/render', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markdown, css }),
    });
    // Preview update arrives via SSE
  } catch (err) {
    setStatus('error', `Render failed: ${err.message}`);
  }
}

async function doExport() {
  $exportBtn.disabled    = true;
  $exportBtn.textContent = '⏳ Exporting…';
  try {
    const res = await fetch('/api/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markdown: _markdown, css: _css, filename: 'document' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'document.pdf' });
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
// Image Library & Editors
// ---------------------------------------------------------------------------

let imageLibrary;

const mdView = createMarkdownEditor(
  $mdEditor,
  (text) => {
    _markdown = text;
    postRender(_markdown, _css);
  },
  {
    onImageVicinity: (url) => {
      if (imageLibrary) imageLibrary.focusImage(url);
    },
    onDropImage: (imgData) => {
      if (imageLibrary) imageLibrary.focusImage(imgData.url);
    },
  }
);

imageLibrary = initImageLibrary({
  container:     $imageLibrary,
  listEl:        $imageList,
  dropzoneEl:    $libraryDropzone,
  fileInputEl:   $imageInput,
  countEl:       $imageCount,
  uploadBtnEl:   $uploadLibraryBtn,
  onInsert: (snippet) => {
    const pos = mdView.state.selection.main.head;
    mdView.dispatch({
      changes:   { from: pos, insert: snippet },
      selection: { anchor: pos + snippet.length },
    });
    mdView.focus();
  },
});

const cssView = createCssEditor($cssEditor, (text) => {
  _css = text;
  postRender(_markdown, _css);
});

_markdown = mdView.state.doc.toString();
_css      = cssView.state.doc.toString();

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------
connectSSE(window);

window.addEventListener('sse:connected', () => {
  setStatus('connected', 'Live');
  postRender(_markdown, _css);   // initial render on connect
});

window.addEventListener('sse:render', (ev) => {
  const { html, css } = ev.detail;
  updatePreview($frame, html, css || _css, _previewTheme);
  setStatus('connected', 'Live');

  setTimeout(() => {
    try {
      const pages = $frame.contentDocument?.querySelectorAll('.pagedjs_page')?.length ?? 0;
      $pageCount.textContent = pages ? `${pages} page${pages > 1 ? 's' : ''}` : '';
    } catch { /* cross-origin guard */ }
  }, 800);
});

window.addEventListener('sse:error',   (ev) => setStatus('error', ev.detail.message));
window.addEventListener('sse:offline', ()   => setStatus('idle', 'Reconnecting…'));

// ---------------------------------------------------------------------------
// Preview init
// ---------------------------------------------------------------------------
initPreview($frame, _previewTheme);

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
$exportBtn.addEventListener('click', doExport);

function toggleLibrary() {
  const collapsed = $leftPane.classList.toggle('library-collapsed');
  $toggleLibrary.classList.toggle('active', !collapsed);
  $toggleLibrary.title = collapsed ? 'Show Image Library' : 'Hide Image Library';
}
$toggleLibrary.addEventListener('click', toggleLibrary);

// OS file drag-and-drop onto the left pane imports into image library
$leftPane.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('application/x-editor-image')) return;
  e.preventDefault();
  $leftPane.classList.add('drag-over');
});
$leftPane.addEventListener('dragleave', () => $leftPane.classList.remove('drag-over'));
$leftPane.addEventListener('drop', (e) => {
  if (e.dataTransfer.types.includes('application/x-editor-image')) return;
  e.preventDefault();
  $leftPane.classList.remove('drag-over');
  const imgs = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (imgs.length && imageLibrary) imageLibrary.uploadFiles(imgs);
});

function toggleCssPanel() {
  const collapsed = $leftPane.classList.toggle('css-collapsed');
  $toggleCssInner.setAttribute('aria-expanded', String(!collapsed));
  $toggleCss.title      = collapsed ? 'Show CSS panel'     : 'Hide CSS panel';
  $toggleCssInner.title = collapsed ? 'Expand CSS panel'   : 'Collapse CSS panel';
}
$toggleCss.addEventListener('click', toggleCssPanel);
$toggleCssInner.addEventListener('click', toggleCssPanel);

// ---------------------------------------------------------------------------
// Preview background theme (Light / Dark desk variants)
// ---------------------------------------------------------------------------
function setPreviewTheme(theme) {
  _previewTheme = theme === 'dark' ? 'dark' : 'light';
  const isDark = _previewTheme === 'dark';
  $previewScroll?.classList.toggle('preview-theme--dark', isDark);
  $previewScroll?.classList.toggle('preview-theme--light', !isDark);

  $previewThemeToggle?.querySelectorAll('.preview-theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === _previewTheme);
  });

  setPreviewDocumentTheme($frame, _previewTheme);

  try {
    localStorage.setItem('css_editor_preview_theme', _previewTheme);
  } catch {}
}

setPreviewTheme(_previewTheme);

$previewThemeToggle?.addEventListener('click', (e) => {
  const btn = e.target.closest('.preview-theme-btn');
  if (btn && btn.dataset.theme) {
    setPreviewTheme(btn.dataset.theme);
  }
});

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
  document.body.style.cursor    = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!_dragging) return;
  const totalW  = $panes.clientWidth - 4;
  const delta   = e.clientX - _startX;
  const leftPx  = parseFloat(_startColStr.split(' ')[0]);
  const newLeft = Math.max(200, Math.min(totalW - 200, leftPx + delta));
  $panes.style.gridTemplateColumns = `${newLeft}px 4px ${totalW - newLeft}px`;
  _startX      = e.clientX;
  _startColStr = $panes.style.gridTemplateColumns;
});

document.addEventListener('mouseup', () => {
  if (!_dragging) return;
  _dragging = false;
  $divider.classList.remove('dragging');
  document.body.style.cursor    = '';
  document.body.style.userSelect = '';
});
