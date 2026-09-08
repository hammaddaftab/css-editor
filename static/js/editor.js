/**
 * editor.js — CodeMirror 5 editor factory
 *
 * CodeMirror 5 is loaded as a global (window.CodeMirror) from cdnjs in
 * index.html — no ES module imports needed, no CDN resolution issues.
 *
 * Exports:
 *   createMarkdownEditor(container, onChange) → CodeMirror instance
 *   createCssEditor(container, onChange)      → CodeMirror instance
 *
 * Both editors use the Dracula theme and call onChange (debounced 400 ms)
 * whenever the document content changes.
 */

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

function makeEditor(container, options, onChange) {
  const cm = window.CodeMirror(container, {
    theme:       'dracula',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit:  2,
    tabSize:     2,
    autofocus:   false,
    ...options,
  });

  cm.on('change', debounce(() => onChange(cm.getValue()), DEBOUNCE_MS));
  return cm;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount a markdown CodeMirror 5 editor into *container*.
 * @param {HTMLElement}           container
 * @param {(text: string) => void} onChange — debounced content change callback
 * @returns {CodeMirror.Editor}
 */
export function createMarkdownEditor(container, onChange) {
  return makeEditor(
    container,
    {
      mode:      { name: 'markdown', xml: true },
      value:     DEFAULT_MARKDOWN,
      extraKeys: { Enter: 'newlineAndIndentContinueMarkdownList' },
      placeholder: 'Start writing markdown…',
    },
    onChange,
  );
}

/**
 * Mount a CSS CodeMirror 5 editor into *container*.
 * @param {HTMLElement}           container
 * @param {(text: string) => void} onChange — debounced content change callback
 * @returns {CodeMirror.Editor}
 */
export function createCssEditor(container, onChange) {
  return makeEditor(
    container,
    {
      mode:        'css',
      value:       DEFAULT_CSS,
      placeholder: '/* Custom CSS… */',
    },
    onChange,
  );
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

Add more content to see pagination in action. Lorem ipsum dolor sit amet,
consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.

## Page Break Demo

You can force a new page with a horizontal rule or the \`.page-break\` class.
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
