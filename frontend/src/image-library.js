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

export function initImageLibrary({
  container,
  listEl,
  dropzoneEl,
  fileInputEl,
  countEl,
  uploadBtnEl,
  onInsert,
}) {
  let _images = [];
  let _focusedUrl = null;

  // ---------------------------------------------------------------------------
  // API Calls
  // ---------------------------------------------------------------------------
  async function fetchImages() {
    try {
      const res = await fetch('/api/images');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _images = await res.json();
      renderList();
    } catch (err) {
      console.error('Failed to fetch images:', err);
    }
  }

  async function uploadFiles(files) {
    if (!files || !files.length) return;

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
        const res = await fetch('/api/images', { method: 'POST', body: form });
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

    await fetchImages();

    // If new images were uploaded, focus the first new one
    if (uploaded.length > 0) {
      focusImage(uploaded[0].url);
    }
  }

  async function deleteImage(filename) {
    if (!confirm(`Delete image "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchImages();
      } else {
        alert('Failed to delete image');
      }
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    }
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
      return;
    }

    for (const img of _images) {
      const card = createCardElement(img);
      listEl.appendChild(card);
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

    const displayName = img.filename.length > 22
      ? `${img.filename.slice(0, 10)}…${img.filename.slice(-8)}`
      : img.filename;

    card.innerHTML = `
      <div class="image-card__thumb-wrap">
        <img class="image-card__thumb" src="${img.url}" alt="${img.filename}" loading="lazy" />
        <div class="image-card__drag-overlay">
          <span>⠿ Drag onto line</span>
        </div>
      </div>
      <div class="image-card__body">
        <div class="image-card__meta">
          <span class="image-card__name" title="${img.filename}">${displayName}</span>
          <span class="image-card__size">${formatBytes(img.size)}</span>
        </div>
        <div class="image-card__actions">
          <button class="image-card__btn image-card__btn--insert" title="Insert at current cursor">＋ Insert</button>
          <button class="image-card__btn image-card__btn--copy" title="Copy markdown snippet">📋</button>
          <button class="image-card__btn image-card__btn--delete" title="Delete image">🗑</button>
        </div>
      </div>
    `;

    // Drag events
    card.addEventListener('dragstart', (e) => {
      card.classList.add('is-dragging');
      const payload = {
        url: img.url,
        alt: img.filename,
        filename: img.filename,
      };
      e.dataTransfer.setData('application/x-editor-image', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', `![${img.filename}](${img.url})`);
      e.dataTransfer.effectAllowed = 'copy';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
    });

    // Action buttons
    const insertBtn = card.querySelector('.image-card__btn--insert');
    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onInsert) onInsert(`\n![${img.filename}](${img.url})\n`);
    });

    const copyBtn = card.querySelector('.image-card__btn--copy');
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const snippet = `![${img.filename}](${img.url})`;
      try {
        await navigator.clipboard.writeText(snippet);
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
      } catch {
        alert('Copied: ' + snippet);
      }
    });

    const deleteBtn = card.querySelector('.image-card__btn--delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteImage(img.filename);
    });

    return card;
  }

  // ---------------------------------------------------------------------------
  // Vicinity Focus
  // ---------------------------------------------------------------------------
  function focusImage(url) {
    _focusedUrl = url;

    // Clear existing focus
    const cards = listEl.querySelectorAll('.image-card');
    cards.forEach((c) => c.classList.remove('is-focused'));

    if (!url) return;

    // Match either exact URL or by filename (e.g. if URL is relative vs absolute)
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
    toggle(show) {
      if (container) {
        container.classList.toggle('is-collapsed', typeof show === 'boolean' ? !show : undefined);
      }
    },
  };
}
