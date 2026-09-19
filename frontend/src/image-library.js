/**
 * image-library.js — Image Library Drawer component
 *
 * Manages:
 *   - Fetching and listing uploaded images from GET /api/images
 *   - Drag-and-drop file import (multi-image upload)
 *   - Draggable cards with custom DataTransfer payload ('application/x-editor-image')
 *   - Realtime card focus & smooth auto-scroll when cursor is in vicinity of image links
 */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STORAGE_KEY = 'css_editor_image_names';

function getStoredImageNames() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStoredImageName(filename, name) {
  try {
    const names = getStoredImageNames();
    names[filename] = name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch (err) {
    console.warn('Failed to save image name:', err);
  }
}

function deleteStoredImageName(filename) {
  try {
    const names = getStoredImageNames();
    delete names[filename];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {}
}

export function initImageLibrary({
  container,
  listEl,
  dropzoneEl,
  fileInputEl,
  countEl,
  uploadBtnEl,
  onInsert,
  onNameChange,
  project = '',
  docPath = '',
}) {
  let _images = [];
  let _project = project;
  let _docPath = docPath;
  let _focusedUrl = null;
  let _selectedImage = null;
  let _selectedCard = null;
  let _selectedFilename = null;

  function getQuery(projectOverride = _project) {
    if (_docPath) return `?doc=${encodeURIComponent(_docPath)}`;
    return projectOverride ? `?project=${encodeURIComponent(projectOverride)}` : '';
  }

  // ---------------------------------------------------------------------------
  // Toast Feedback in Library Drawer
  // ---------------------------------------------------------------------------
  let toastEl = container?.querySelector('.image-library__toast');
  if (container && !toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'image-library__toast';
    container.appendChild(toastEl);
  }

  let toastTimer = null;
  function showFeedback(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 2200);
  }

  function showCardBadge(card, text) {
    if (!card) return;
    const existing = card.querySelector('.image-card__badge-feedback');
    if (existing) existing.remove();
    const badge = document.createElement('div');
    badge.className = 'image-card__badge-feedback';
    badge.textContent = text;
    card.appendChild(badge);
    setTimeout(() => badge.remove(), 1200);
  }

  // ---------------------------------------------------------------------------
  // Card Selection
  // ---------------------------------------------------------------------------
  function selectCard(card, img) {
    if (_selectedCard && _selectedCard !== card) {
      _selectedCard.classList.remove('is-selected');
    }
    card.classList.add('is-selected');
    _selectedCard = card;
    _selectedImage = img;
    _selectedFilename = img.filename;
  }

  function clearSelection() {
    if (_selectedCard) {
      _selectedCard.classList.remove('is-selected');
    }
    _selectedCard = null;
    _selectedImage = null;
    _selectedFilename = null;
  }

  // ---------------------------------------------------------------------------
  // Copy and Delete Actions
  // ---------------------------------------------------------------------------
  async function copySelectedImage() {
    if (!_selectedImage || !_selectedCard) return;
    const altText = _selectedImage.displayName || _selectedImage.alt || _selectedImage.filename;
    const snippet = `![${altText}](${_selectedImage.url})`;

    try {
      await navigator.clipboard.writeText(snippet);
      showFeedback(`📋 Copied markdown for "${altText}"`);
      showCardBadge(_selectedCard, '✓ Copied!');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showFeedback(`📋 Copied markdown for "${altText}"`);
      showCardBadge(_selectedCard, '✓ Copied!');
    }
  }

  async function deleteSelectedImage() {
    if (!_selectedImage) return;
    const imgToDelete = _selectedImage;
    const name = imgToDelete.displayName || imgToDelete.filename;

    try {
      const query = getQuery();
      const res = await fetch(`/api/images/${encodeURIComponent(imgToDelete.filename)}${query}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showFeedback(`🗑️ Deleted "${name}" from library`);
        deleteStoredImageName(imgToDelete.filename);
        clearSelection();
        await fetchImages();
      } else {
        const errData = await res.json().catch(() => ({}));
        showFeedback(`⚠️ Failed to delete "${name}": ${errData.detail || res.statusText}`);
      }
    } catch (err) {
      showFeedback(`⚠️ Delete error: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Global Keyboard Shortcuts (Ctrl+C / Del on selected card)
  // ---------------------------------------------------------------------------
  function handleKeyDown(e) {
    if (!_selectedImage || !_selectedCard) return;

    const activeEl = document.activeElement;
    const isEditingName = activeEl && activeEl.classList.contains('image-card__name-input');
    const isInCodeMirror = activeEl && activeEl.closest('.cm-editor');
    const isInOtherInput = activeEl && activeEl !== activeEl.closest('.image-card__name-input') &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    // 1. Copy shortcut: Ctrl+C / Cmd+C
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      // If user has actively selected text in an input or CodeMirror, do regular copy
      if (isInCodeMirror || isInOtherInput) return;
      if (isEditingName && activeEl.selectionStart !== activeEl.selectionEnd) return;

      e.preventDefault();
      copySelectedImage();
      return;
    }

    // 2. Delete shortcut: Delete or Del
    if (e.key === 'Delete' || e.key === 'Del') {
      // Never delete image card if typing in any text field or editor!
      if (isEditingName || isInCodeMirror || isInOtherInput) return;

      e.preventDefault();
      deleteSelectedImage();
      return;
    }

    // 3. Escape: deselect
    if (e.key === 'Escape') {
      clearSelection();
      if (isEditingName) activeEl.blur();
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  // Clear selection on clicking empty space in the library list
  listEl.addEventListener('click', (e) => {
    if (!e.target.closest('.image-card')) {
      clearSelection();
    }
  });

  // ---------------------------------------------------------------------------
  // API Calls
  // ---------------------------------------------------------------------------
  async function fetchImages(projectOverride = _project) {
    try {
      const query = getQuery(projectOverride);
      const res = await fetch(`/api/images${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _images = await res.json();
      renderList();
    } catch (err) {
      console.error('Failed to fetch images:', err);
    }
  }

  async function uploadFiles(files, projectOverride = _project) {
    if (!files || !files.length) return [];

    if (dropzoneEl) {
      dropzoneEl.classList.add('is-uploading');
      const textSpan = dropzoneEl.querySelector('.dropzone-text');
      if (textSpan) textSpan.textContent = `Uploading ${files.length} image(s)…`;
    }

    const uploaded = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      try {
        const query = getQuery(projectOverride);
        const res = await fetch(`/api/images${query}`, { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          uploaded.push(data);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`Upload error for ${file.name}:`, errData.detail || res.statusText);
        }
      } catch (err) {
        console.error(`Upload network error for ${file.name}:`, err);
      }
    }

    if (dropzoneEl) {
      dropzoneEl.classList.remove('is-uploading');
      const textSpan = dropzoneEl.querySelector('.dropzone-text');
      if (textSpan) textSpan.textContent = '📥 Drop images here to upload';
    }

    await fetchImages(projectOverride);

    // If new images were uploaded, focus the first new one
    if (uploaded.length > 0) {
      focusImage(uploaded[0].url);
    }

    return uploaded;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderList() {
    if (countEl) countEl.textContent = _images.length;
    listEl.innerHTML = '';

    if (_images.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'image-library__empty';
      emptyMsg.innerHTML = '<p>No images yet</p><span class="text-muted">Import or drag images above</span>';
      listEl.appendChild(emptyMsg);
      clearSelection();
      return;
    }

    const savedNames = getStoredImageNames();

    for (const img of _images) {
      // Attach saved custom name if available
      img.displayName = savedNames[img.filename] || img.filename;
      img.alt = img.displayName;

      const card = createCardElement(img);
      listEl.appendChild(card);

      // Restore selection if this was the selected card
      if (_selectedFilename && img.filename === _selectedFilename) {
        selectCard(card, img);
      }
    }

    // Re-apply focus if an active URL exists
    if (_focusedUrl) {
      focusImage(_focusedUrl);
    }
  }

  function createCardElement(img) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.draggable = true;
    card.setAttribute('data-url', img.url);
    card.setAttribute('data-filename', img.filename);
    card.tabIndex = 0;

    const currentName = img.displayName || img.filename;

    card.innerHTML = `
      <div class="image-card__thumb-wrap">
        <img class="image-card__thumb" src="${img.url}" alt="${escapeHtml(currentName)}" loading="lazy" />
        <div class="image-card__drag-overlay">
          <span>⠿ Drag onto line</span>
        </div>
      </div>
      <div class="image-card__body">
        <div class="image-card__meta">
          <input
            type="text"
            class="image-card__name-input"
            value="${escapeHtml(currentName)}"
            title="${escapeHtml(currentName)}"
            placeholder="Image name…"
            spellcheck="false"
          />
          <span class="image-card__size">${formatBytes(img.size)}</span>
        </div>
      </div>
    `;

    const nameInput = card.querySelector('.image-card__name-input');
    const thumbImg  = card.querySelector('.image-card__thumb');

    // ── Selection on Click ──────────────────────────────────────────────
    card.addEventListener('click', (e) => {
      selectCard(card, img);
    });

    // Optional quick-insert on double click
    card.addEventListener('dblclick', (e) => {
      if (e.target === nameInput) return;
      if (onInsert) {
        const altText = img.displayName || img.filename;
        onInsert(`\n![${altText}](${img.url})\n`);
        showFeedback(`＋ Inserted "${altText}" at cursor`);
      }
    });

    // ── Live Editable Name Field ────────────────────────────────────────
    let wasAlreadyFocused = false;

    nameInput.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      wasAlreadyFocused = (document.activeElement === nameInput);
      selectCard(card, img);
    });

    nameInput.addEventListener('focus', () => {
      card.draggable = false;
      selectCard(card, img);
      if (!wasAlreadyFocused) {
        requestAnimationFrame(() => {
          nameInput.select();
        });
      }
    });

    nameInput.addEventListener('mouseup', (e) => {
      if (!wasAlreadyFocused) {
        e.preventDefault();
        nameInput.select();
      }
    });

    nameInput.addEventListener('blur', () => {
      card.draggable = true;
      wasAlreadyFocused = false;
    });

    // Live update on keypresses (no Enter required!)
    nameInput.addEventListener('input', () => {
      const newName = nameInput.value;
      img.displayName = newName;
      img.alt = newName;
      thumbImg.alt = newName;
      nameInput.title = newName;

      saveStoredImageName(img.filename, newName);

      if (onNameChange) {
        onNameChange(img, newName);
      }
    });

    nameInput.addEventListener('keydown', (e) => {
      // Prevent Del / Backspace from deleting card while typing
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
      }
      if (e.key === 'Enter') {
        nameInput.blur();
      }
    });

    // ── Drag Events ─────────────────────────────────────────────────────
    card.addEventListener('dragstart', (e) => {
      card.classList.add('is-dragging');
      const altText = img.displayName || img.filename;
      const targetPath = img.rel_path || img.url;
      const payload = {
        url: img.url,
        alt: altText,
        filename: img.filename,
        rel_path: img.rel_path,
      };
      e.dataTransfer.setData('application/x-editor-image', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', `![${altText}](${targetPath})`);
      e.dataTransfer.effectAllowed = 'copy';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
    });

    return card;
  }

  // ---------------------------------------------------------------------------
  // Vicinity Focus
  // ---------------------------------------------------------------------------
  function focusImage(url) {
    _focusedUrl = url;

    // Clear existing vicinity focus
    const cards = listEl.querySelectorAll('.image-card');
    cards.forEach((c) => c.classList.remove('is-focused'));

    if (!url) return;

    // Match either exact URL or by filename
    const targetFilename = url.split('/').pop().split('?')[0];
    let matchedCard = null;

    for (const card of cards) {
      const cardUrl = card.getAttribute('data-url');
      const cardFilename = card.getAttribute('data-filename');
      if (cardUrl === url || cardFilename === targetFilename || (cardUrl && cardUrl.endsWith(targetFilename))) {
        matchedCard = card;
        break;
      }
    }

    if (matchedCard) {
      matchedCard.classList.add('is-focused');
      matchedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ---------------------------------------------------------------------------
  // Dropzone & File Input Bindings
  // ---------------------------------------------------------------------------
  if (uploadBtnEl && fileInputEl) {
    uploadBtnEl.addEventListener('click', () => fileInputEl.click());
  }

  if (dropzoneEl) {
    dropzoneEl.addEventListener('click', () => {
      if (fileInputEl) fileInputEl.click();
    });

    dropzoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneEl.classList.add('drag-over');
    });

    dropzoneEl.addEventListener('dragleave', () => {
      dropzoneEl.classList.remove('drag-over');
    });

    dropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('drag-over');
      const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) uploadFiles(files);
    });
  }

  if (fileInputEl) {
    fileInputEl.addEventListener('change', (e) => {
      const files = [...e.target.files];
      if (files.length) uploadFiles(files);
      e.target.value = '';
    });
  }

  // Initial load
  fetchImages();

  return {
    fetchImages,
    uploadFiles,
    focusImage,
    selectCard,
    clearSelection,
    setProject(nextProject) {
      _project = nextProject || '';
      clearSelection();
      return fetchImages();
    },
    setDoc(docPath) {
      _docPath = docPath || '';
      clearSelection();
      return fetchImages();
    },
    toggle(show) {
      if (container) {
        container.classList.toggle('is-collapsed', typeof show === 'boolean' ? !show : undefined);
      }
    },
  };
}
