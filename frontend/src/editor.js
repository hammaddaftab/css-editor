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
import { EditorState }            from '@codemirror/state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const DEBOUNCE_MS = 400;

function makeEditor({ container, doc, lang, onChange }) {
  const onChangeFn = debounce(onChange, DEBOUNCE_MS);

  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        lang,
        oneDark,
        EditorView.theme({
          '&':            { height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
        }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // update.state.doc is always current — no stale closure issue
            onChangeFn(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container,
  });

  return view;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createMarkdownEditor(container, onChange) {
  return makeEditor({ container, doc: DEFAULT_MARKDOWN, lang: markdown(), onChange });
}

export function createCssEditor(container, onChange) {
  return makeEditor({ container, doc: DEFAULT_CSS, lang: css(), onChange });
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
