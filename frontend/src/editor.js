/**
 * editor.js — CodeMirror 6 editor factory
 *
 * Imports resolved by Vite from node_modules — no CDN, no version conflicts.
 *
 * Exports:
 *   createMarkdownEditor(container, onChange) → EditorView
 *   createCssEditor(container, onChange)      → EditorView
 */
import { EditorView, basicSetup } from 'codemirror';
import { markdown }               from '@codemirror/lang-markdown';
import { css }                    from '@codemirror/lang-css';
import { oneDark }                from '@codemirror/theme-one-dark';
import { Annotation, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, keymap }     from '@codemirror/view';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const programmaticContentUpdate = Annotation.define();

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Realtime Drop Target Line Feedback Extension
// ---------------------------------------------------------------------------

export const setDropTargetLine   = StateEffect.define();
export const clearDropTargetLine = StateEffect.define();

export const dropTargetField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDropTargetLine)) {
        const lineNum = effect.value;
        if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
          const line = tr.state.doc.line(lineNum);
          decorations = Decoration.set([
            Decoration.line({ class: 'cm-drop-target-line' }).range(line.from),
          ]);
        }
      } else if (effect.is(clearDropTargetLine)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function makeImageDragDropExtension(onDropImage) {
  return EditorView.domEventHandlers({
    dragover(event, view) {
      const isImageCard = event.dataTransfer.types.includes('application/x-editor-image');
      if (!isImageCard) return false;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          effects: setDropTargetLine.of(line.number),
        });
      }
      return true;
    },

    dragleave(event, view) {
      if (!view.dom.contains(event.relatedTarget)) {
        view.dispatch({ effects: clearDropTargetLine.of(null) });
      }
      return true;
    },

    drop(event, view) {
      view.dispatch({ effects: clearDropTargetLine.of(null) });

      const rawData = event.dataTransfer.getData('application/x-editor-image');
      if (!rawData) return false;

      event.preventDefault();
      let imgData;
      try {
        imgData = JSON.parse(rawData);
      } catch {
        return false;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const insertPos = pos !== null ? pos : view.state.selection.main.head;
      const line = view.state.doc.lineAt(insertPos);
      const altText = imgData.alt || 'image';
      const snippet = `![${altText}](${imgData.url})`;

      if (line.text.trim().length === 0) {
        // Line is blank, drop right in place
        view.dispatch({
          changes:   { from: line.from, to: line.to, insert: snippet },
          selection: { anchor: line.from + snippet.length },
        });
      } else {
        // Insert on a new line below
        const insertFrom = line.to;
        const textToInsert = `\n\n${snippet}`;
        view.dispatch({
          changes:   { from: insertFrom, insert: textToInsert },
          selection: { anchor: insertFrom + textToInsert.length },
        });
      }

      view.focus();
      if (onDropImage) onDropImage(imgData);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Image Paste Extension (upload pasted images from clipboard)
// ---------------------------------------------------------------------------

export function makeImagePasteExtension(onPasteImage) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items) return false;

      const imageFiles = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return false;

      event.preventDefault();

      // Insert a placeholder at the cursor while uploading
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      const onBlankLine = line.text.trim().length === 0;
      const placeholder = '![Uploading image…]()';
      const insertText = onBlankLine ? placeholder : `\n\n${placeholder}`;

      view.dispatch({
        changes: { from: head, insert: insertText },
        selection: { anchor: head + insertText.length },
      });

      // Let the image-library owner upload each file. This keeps pasted images
      // in the active project's library and uses the same upload pipeline as
      // drag-and-drop/import.
      (async () => {
        for (const file of imageFiles) {
          try {
            const data = await onPasteImage?.(file);
            if (!data) continue;
            const altText = file.name || 'image';
            const snippet = `![${altText}](${data.url})`;

            // Find and replace the placeholder in the current doc
            const docText = view.state.doc.toString();
            const placeholderIdx = docText.indexOf(placeholder);
            if (placeholderIdx !== -1) {
              view.dispatch({
                changes: {
                  from: placeholderIdx,
                  to: placeholderIdx + placeholder.length,
                  insert: snippet,
                },
              });
            }
          } catch (err) {
            console.error('Image paste upload error:', err);
          }
        }
      })();

      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Image Vicinity Extension (Focus in library when cursor/hover is near link)
// ---------------------------------------------------------------------------

const IMG_MARKDOWN_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function findImageNearOffset(lineText, offset, threshold = 15) {
  IMG_MARKDOWN_REGEX.lastIndex = 0;
  let match;
  while ((match = IMG_MARKDOWN_REGEX.exec(lineText)) !== null) {
    const start = match.index;
    const end   = start + match[0].length;
    if (offset >= start - threshold && offset <= end + threshold) {
      return match[2]; // url
    }
  }
  return null;
}

export function makeImageVicinityExtension(onFocusImage) {
  let lastFocusedUrl = null;

  function notifyFocus(url) {
    if (url !== lastFocusedUrl) {
      lastFocusedUrl = url;
      onFocusImage(url);
    }
  }

  const selectionListener = EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const head = update.state.selection.main.head;
    const doc  = update.state.doc;
    const line = doc.lineAt(head);
    const offset = head - line.from;

    let matchedUrl = findImageNearOffset(line.text, offset, 15);

    // If on a blank line, check line immediately above or below
    if (!matchedUrl && line.text.trim() === '') {
      if (line.number > 1) {
        const prev = doc.line(line.number - 1);
        matchedUrl = findImageNearOffset(prev.text, prev.text.length, 5);
      }
      if (!matchedUrl && line.number < doc.lines) {
        const next = doc.line(line.number + 1);
        matchedUrl = findImageNearOffset(next.text, 0, 5);
      }
    }

    notifyFocus(matchedUrl);
  });

  const mouseHandler = EditorView.domEventHandlers({
    mousemove(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;
      const line   = view.state.doc.lineAt(pos);
      const offset = pos - line.from;
      const url    = findImageNearOffset(line.text, offset, 5);
      if (url) {
        notifyFocus(url);
      }
    },
  });

  return [selectionListener, mouseHandler];
}

// ---------------------------------------------------------------------------
// Editor factory
// ---------------------------------------------------------------------------

function makeEditor({ container, doc, lang, onChange, onSave, extraExtensions = [] }) {
  const onChangeFn = debounce(onChange, DEBOUNCE_MS);

  const extensions = [
    basicSetup,
    lang,
    oneDark,
    EditorView.theme({
      '&':            { height: '100%' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
    }),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      const isProgrammatic = update.transactions.some((transaction) =>
        transaction.annotation(programmaticContentUpdate)
      );
      if (update.docChanged && !isProgrammatic) {
        // update.state.doc is always current — no stale closure issue
        onChangeFn(update.state.doc.toString());
      }
    }),
    ...extraExtensions,
  ];

  if (onSave) {
    extensions.push(
      keymap.of([
        {
          key: 'Mod-s',
          run() {
            onSave();
            return true;
          },
        },
      ])
    );
  }

  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions,
    }),
    parent: container,
  });

  return view;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setEditorContent(view, text) {
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: programmaticContentUpdate.of(true),
  });
}

export function createMarkdownEditor(container, onChange, { doc = DEFAULT_MARKDOWN, onImageVicinity, onDropImage, onPasteImage, onSave } = {}) {
  const extraExtensions = [
    dropTargetField,
    makeImageDragDropExtension(onDropImage),
    makeImagePasteExtension(onPasteImage),
  ];

  if (onImageVicinity) {
    extraExtensions.push(...makeImageVicinityExtension(onImageVicinity));
  }

  return makeEditor({
    container,
    doc,
    lang: markdown(),
    onChange,
    onSave,
    extraExtensions,
  });
}

export function createCssEditor(container, onChange, { doc = DEFAULT_CSS, onSave } = {}) {
  return makeEditor({ container, doc, lang: css(), onChange, onSave });
}

// ---------------------------------------------------------------------------
// Default content
// ---------------------------------------------------------------------------

const DEFAULT_MARKDOWN = `# Welcome to CSS Markdown Editor

A **live preview** markdown editor with A4 pagination, powered by
[paged.js](https://pagedjs.org/) in the browser and WeasyPrint for PDF export.

## Features

- Real-time preview via **Server-Sent Events**
- Multi-page A4 layout via **paged.js**
- PDF export via **WeasyPrint**
- Custom CSS — edit the CSS panel on the left

## Code

\`\`\`python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello, World!"}
\`\`\`

## Table

| Feature         | Browser Preview | PDF Export |
|-----------------|-----------------|------------|
| Page breaks     | paged.js        | WeasyPrint |
| Custom CSS      | ✓               | ✓          |
| @page rules     | ✓               | ✓          |

---

## Pandoc-Style Syntax (No HTML tags needed!)

::: warning
**Important Notice:** You can use \`::: class-name\` or \`::: {.class #id key=val}\` to create containers without polluting your markdown with raw \`<div>\` tags!
:::

::: {.callout #tip-1}
You can also use inline spans like [New Feature]{.badge .badge-info} or [Critical]{.badge .badge-warning}.
:::

::: page-break
:::

## Multi-Column Layout (Page 2)

:::: columns
::: col
### Left Column
Clean text on the left side of the page.
:::

::: col
### Right Column
Clean text on the right side of the page.
:::
::::
`;

const DEFAULT_CSS = `/* Custom document CSS — overrides print.css defaults */

:root {
  --accent:      #0d9488;
  --color-link:  #0d9488;
}

h1 { border-bottom-color: var(--accent); }
h2 { color: #0f766e; }
pre.code-block { border-left-color: var(--accent); }
`;
