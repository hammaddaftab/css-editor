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

import { createMarkdownEditor, createCssEditor, setEditorContent } from './editor.js';
import { connectSSE }                            from './sse-client.js';
import { initPreview, updatePreview, setPreviewDocumentTheme } from './preview.js';
import { initImageLibrary }                      from './image-library.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $mdEditor           = document.getElementById('md-editor');
const $cssEditor          = document.getElementById('css-editor');
const $frame              = document.getElementById('preview-frame');
const $status             = document.getElementById('sse-status');
const $pageCount          = document.getElementById('page-count');
const $exportBtn          = document.getElementById('export-btn');
const $toggleLibrary      = document.getElementById('toggle-library');
const $imageLibrary       = document.getElementById('image-library');
const $imageList          = document.getElementById('image-list');
const $libraryDropzone    = document.getElementById('library-dropzone');
const $uploadLibraryBtn   = document.getElementById('upload-library-btn');
const $imageCount         = document.getElementById('image-count');
const $imageInput         = document.getElementById('image-input');
const $toggleCss          = document.getElementById('toggle-css');
const $toggleCssInner     = document.getElementById('toggle-css-inner');
const $leftPane           = document.getElementById('left-pane');
const $divider            = document.getElementById('pane-divider');
const $panes              = document.querySelector('.panes');
const $previewScroll      = document.querySelector('.preview-scroll');
const $previewThemeToggle = document.getElementById('preview-theme-toggle');
const $docSelect          = document.getElementById('doc-select');
const $docDirty           = document.getElementById('doc-dirty');
const $saveBtn            = document.getElementById('save-btn');
const $saveStatus         = document.getElementById('save-status');
const $settingsBtn        = document.getElementById('settings-btn');
const $settingsDropdown   = document.getElementById('settings-dropdown');
const $toggleNocrop       = document.getElementById('toggle-nocrop');
const $toggleNowhitespace = document.getElementById('toggle-nowhitespace');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _markdown = '';
let _css      = '';
let _previewTheme = localStorage.getItem('css_editor_preview_theme') || 'light';
let _currentFilename = localStorage.getItem('css_editor_active_file') || 'document.md';
let _isDirty = false;

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
// Local Document Management (Current Directory)
// ---------------------------------------------------------------------------

let _conflictNoticeEl = null;

function hideConflictNotice() {
  if (_conflictNoticeEl) {
    _conflictNoticeEl.remove();
    _conflictNoticeEl = null;
  }
}

function showConflictNotice(data) {
  hideConflictNotice();

  const banner = document.createElement('div');
  banner.className = 'conflict-banner';
  banner.innerHTML = `
    <div class="conflict-banner__text">
      <strong>⚠️ Disk file changed:</strong> <code>${data.filename}</code> was modified externally, but you have unsaved edits.
    </div>
    <div class="conflict-banner__actions">
      <button class="btn btn--xs btn--primary" id="conflict-reload-btn">Reload from disk</button>
      <button class="btn btn--xs btn--ghost" id="conflict-keep-btn">Keep my edits</button>
    </div>
  `;

  document.body.appendChild(banner);
  _conflictNoticeEl = banner;

  banner.querySelector('#conflict-reload-btn')?.addEventListener('click', () => {
    if (data.markdown !== undefined) {
      _markdown = data.markdown;
      setEditorContent(mdView, _markdown);
    }
    if (data.css !== undefined) {
      _css = data.css;
      setEditorContent(cssView, _css);
    }
    if (data.html) {
      updatePreview($frame, data.html, _css, _previewTheme);
    }
    markClean('Reloaded from disk');
    hideConflictNotice();
  });

  banner.querySelector('#conflict-keep-btn')?.addEventListener('click', () => {
    hideConflictNotice();
  });
}

function markDirty() {
  if (!_isDirty) {
    _isDirty = true;
    $docDirty?.classList.add('is-dirty');
    if ($saveStatus) {
      $saveStatus.textContent = 'Unsaved';
      $saveStatus.classList.remove('is-saved');
    }
  }
}

function markClean(msg = 'Saved') {
  _isDirty = false;
  hideConflictNotice();
  $docDirty?.classList.remove('is-dirty');
  if ($saveStatus) {
    $saveStatus.textContent = msg;
    $saveStatus.classList.add('is-saved');
    setTimeout(() => {
      if (!_isDirty && $saveStatus.textContent === msg) {
        $saveStatus.textContent = '';
      }
    }, 3000);
  }
}

async function saveLocalDocument() {
  if ($saveBtn) {
    $saveBtn.disabled = true;
    $saveBtn.textContent = '💾 Saving…';
  }
  try {
    const res = await fetch('/api/document', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        filename: _currentFilename,
        markdown: _markdown,
        css:      _css,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    markClean('Saved');
    await fetchFileList();
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    if ($saveBtn) {
      $saveBtn.disabled = false;
      $saveBtn.textContent = '💾 Save';
    }
  }
}

async function loadLocalDocument(filename) {
  try {
    const res = await fetch(`/api/document?filename=${encodeURIComponent(filename)}`);
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        // Stale or forbidden file cached in localStorage, clear and fallback
        try {
          localStorage.removeItem('css_editor_active_file');
        } catch {}
        const listRes = await fetch('/api/documents');
        if (listRes.ok) {
          const listData = await listRes.json();
          const first = listData.files?.[0]?.filename;
          if (first && first !== filename) {
            await loadLocalDocument(first);
            return;
          }
        }
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.exists) {
      _currentFilename = data.filename;
      _markdown = data.markdown;
      _css      = data.css || '';

      setEditorContent(mdView, _markdown);
      setEditorContent(cssView, _css);
      postRender(_markdown, _css);
      markClean('Loaded');

      try {
        localStorage.setItem('css_editor_active_file', _currentFilename);
      } catch {}

      if ($docSelect) $docSelect.value = _currentFilename;
    }
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err);
  }
}

function updateFileList(files) {
  if (!$docSelect) return;
  $docSelect.innerHTML = '';
  const serverFiles = (files || []).map((f) => f.filename);

  // If the active file is not on the server, fallback to the first available file
  if (serverFiles.length > 0 && !serverFiles.includes(_currentFilename)) {
    _currentFilename = serverFiles[0];
    try {
      localStorage.setItem('css_editor_active_file', _currentFilename);
    } catch {}
  }

  const filenames = new Set(serverFiles);
  if (_currentFilename && (serverFiles.includes(_currentFilename) || serverFiles.length === 0)) {
    filenames.add(_currentFilename);
  }

  for (const fname of Array.from(filenames).sort()) {
    const opt = document.createElement('option');
    opt.value = fname;
    opt.textContent = fname;
    if (fname === _currentFilename) opt.selected = true;
    $docSelect.appendChild(opt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '＋ New file…';
  $docSelect.appendChild(newOpt);
}

async function fetchFileList() {
  try {
    const res = await fetch('/api/documents');
    if (!res.ok) return;
    const data = await res.json();
    updateFileList(data.files || []);
  } catch (err) {
    console.error('Failed to fetch file list:', err);
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
    markDirty();
    postRender(_markdown, _css);
  },
  {
    onSave: saveLocalDocument,
    onImageVicinity: (url) => {
      if (imageLibrary) imageLibrary.focusImage(url);
    },
    onDropImage: (imgData) => {
      if (imageLibrary) imageLibrary.focusImage(imgData.url);
    },
    onPasteImage: (imgData) => {
      if (imageLibrary) {
        imageLibrary.fetchImages();
        imageLibrary.focusImage(imgData.url);
      }
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

const cssView = createCssEditor(
  $cssEditor,
  (text) => {
    _css = text;
    markDirty();
    postRender(_markdown, _css);
  },
  {
    onSave: saveLocalDocument,
  }
);

_markdown = mdView.state.doc.toString();
_css      = cssView.state.doc.toString();

$saveBtn?.addEventListener('click', saveLocalDocument);

$docSelect?.addEventListener('change', async (e) => {
  const val = e.target.value;
  if (val === '__new__') {
    const name = prompt('New markdown filename (e.g. notes.md or dsa-1/notes.md):');
    if (name && name.trim()) {
      let cleanName = name.trim();
      if (!cleanName.endsWith('.md')) cleanName += '.md';
      _currentFilename = cleanName;
      _markdown = `# ${cleanName.replace(/\.md$/, '')}\n\n`;
      _css      = '';
      setEditorContent(mdView, _markdown);
      setEditorContent(cssView, _css);
      markDirty();
      await saveLocalDocument();
    } else {
      $docSelect.value = _currentFilename;
    }
    return;
  }

  if (_isDirty) {
    if (!confirm(`You have unsaved changes in ${_currentFilename}. Switch anyway?`)) {
      $docSelect.value = _currentFilename;
      return;
    }
  }
  await loadLocalDocument(val);
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveLocalDocument();
  }
});

// Load local document from current directory as initial context
(async () => {
  await fetchFileList();
  await loadLocalDocument(_currentFilename);
})();

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------
connectSSE(window);

window.addEventListener('sse:connected', () => {
  setStatus('connected', 'Live');
  postRender(_markdown, _css);   // initial render on connect
});

window.addEventListener('sse:render', (ev) => {
  const { html, css, filename } = ev.detail;
  // If the render event specifies a document filename and it's not our active document, ignore
  if (filename && filename !== _currentFilename) return;

  updatePreview($frame, html, css || _css, _previewTheme);
  setStatus('connected', 'Live');

  setTimeout(() => {
    try {
      const pages = $frame.contentDocument?.querySelectorAll('.pagedjs_page')?.length ?? 0;
      $pageCount.textContent = pages ? `${pages} page${pages > 1 ? 's' : ''}` : '';
    } catch { /* cross-origin guard */ }
  }, 800);
});

// Real-time synchronization when files on disk are modified, created, or deleted
window.addEventListener('sse:file:change', (ev) => {
  const data = ev.detail;
  if (!data || !data.filename) return;

  // Handle deletions on disk
  if (data.action === 'deleted') {
    if (data.filename === _currentFilename) {
      markDirty();
      if ($saveStatus) {
        $saveStatus.textContent = 'Deleted on disk';
        $saveStatus.classList.remove('is-saved');
      }
    }
    fetchFileList();
    return;
  }

  // Handle added files (e.g. created externally on disk)
  if (data.action === 'added') {
    fetchFileList();
  }

  // If the event is for a different document, we only care about the file list update
  if (data.filename !== _currentFilename) {
    return;
  }

  // Disk event is for the active document!
  const mdChanged  = data.markdown !== undefined && data.markdown !== _markdown;
  const cssChanged = data.css !== undefined && data.css !== _css;

  // If contents match what's in memory, no need to update editor
  if (!mdChanged && !cssChanged) {
    return;
  }

  if (!_isDirty) {
    // Editor has no unsaved changes: seamlessly sync CodeMirror and preview from disk
    if (mdChanged) {
      _markdown = data.markdown;
      setEditorContent(mdView, _markdown);
    }
    if (cssChanged) {
      _css = data.css;
      setEditorContent(cssView, _css);
    }
    if (data.html) {
      updatePreview($frame, data.html, _css, _previewTheme);
    }
    markClean('Synced from disk');
    hideConflictNotice();
  } else {
    // Editor has unsaved changes: show conflict prompt so user doesn't lose edits
    showConflictNotice(data);
  }
});

window.addEventListener('sse:file:list', (ev) => {
  const files = ev.detail?.files;
  if (Array.isArray(files)) {
    updateFileList(files);
  } else {
    fetchFileList();
  }
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
// Settings Menu
// ---------------------------------------------------------------------------
$settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  $settingsDropdown.classList.toggle('is-open');
  $settingsBtn.classList.toggle('active', $settingsDropdown.classList.contains('is-open'));
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!$settingsDropdown.contains(e.target) && e.target !== $settingsBtn) {
    $settingsDropdown.classList.remove('is-open');
    $settingsBtn.classList.remove('active');
  }
});

// Prevent clicks inside dropdown from closing it
$settingsDropdown.addEventListener('click', (e) => e.stopPropagation());

// -- No-Crop mode (object-fit: contain) ------------------------------------
const $nocropInput       = $toggleNocrop.querySelector('.settings-toggle__input');
const $nowhitespaceInput = $toggleNowhitespace.querySelector('.settings-toggle__input');

// Restore persisted settings
const _savedNocrop       = localStorage.getItem('css_editor_nocrop') === '1';
const _savedNowhitespace = localStorage.getItem('css_editor_nowhitespace') === '1';

function applyNocrop(enabled) {
  $imageLibrary.classList.toggle('nocrop-mode', enabled);
  $nocropInput.checked = enabled;
  $toggleNowhitespace.classList.toggle('is-visible', enabled);

  // If no-crop is off, also turn off no-whitespace
  if (!enabled) {
    applyNowhitespace(false);
  }

  try { localStorage.setItem('css_editor_nocrop', enabled ? '1' : '0'); } catch {}
}

function applyNowhitespace(enabled) {
  $imageLibrary.classList.toggle('nowhitespace-mode', enabled);
  $nowhitespaceInput.checked = enabled;
  try { localStorage.setItem('css_editor_nowhitespace', enabled ? '1' : '0'); } catch {}
}

// Apply saved state on load
applyNocrop(_savedNocrop);
if (_savedNocrop) applyNowhitespace(_savedNowhitespace);

$nocropInput.addEventListener('change', () => {
  applyNocrop($nocropInput.checked);
});

$nowhitespaceInput.addEventListener('change', () => {
  applyNowhitespace($nowhitespaceInput.checked);
});

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
