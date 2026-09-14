# Welcome to CSS Markdown Editor

A live Markdown editor with **real-time CSS customization**, **multi-page A4 preview**, and **one-click PDF export**.

---

## 🚀 Getting Started

1. **Edit Markdown:** Type in the left panel. Your changes preview instantly on the right.
2. **Custom CSS:** Toggle the **🎨 CSS** button in the toolbar to customize typography, spacing, colors, and layout.
3. **Multi-Page Layout:** Page breaks and headers/footers are computed live using CSS Paged Media.
4. **Export to PDF:** Click **⬇ Export PDF** at any time to generate a print-ready document.

---

## 🎨 Styling Features

You can style individual elements using standard CSS or classes:

```css
/* Example styling */
h1 {
  color: #2563eb;
  border-bottom: 2px solid #2563eb;
}
```

### Multi-Page A4 Break Example

To force content onto the next page in preview and PDF export, use the page break helper:

<div class="page-break"></div>

## 📄 Second Page Heading

This content starts cleanly on the second page because of the `.page-break` rule defined in `project.css`.

| Feature | Description |
|---|---|
| Live Sync | Real-time SSE updates as you type |
| Paged Media | Native A4 preview using paged.js |
| WeasyPrint | Exact PDF rendering from HTML+CSS |
| Image Library | Drag & drop uploads straight into markdown |

---

## 📁 Storage & Configuration

- **Your Projects:** Saved locally in your chosen projects directory.
- **Companion Styles:** Every document has its own companion stylesheet (e.g. `README.css`) plus a shared `project.css` for the whole project.
- **Settings:** Click **⚙ Settings** in the toolbar to change your projects directory or author details anytime.
