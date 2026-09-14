# Welcome to CSS Markdown Editor

A live Markdown editor designed for document crafting with **real-time CSS styling**, **multi-page A4 print preview**, and **one-click PDF export**.

---

## 🚀 Quick Start Guide

1. **Write Markdown:** Edit your content in the left panel. The right panel renders a live, paged A4 preview.
2. **Customize Styles:** Click **🎨 CSS** in the toolbar to open the companion stylesheet editor.
3. **Insert Images:** Use the **🖼 Library** panel to upload assets, or drag & drop images directly into your document:
   ```markdown
   ![Alt description](/api/images/photo.png)
   ```
4. **Export Clean PDF:** Click **⬇ Export PDF** to compile your document into a print-ready PDF via WeasyPrint.

---

## 🎨 Styling & Configuration

The editor applies default print styling (`print.css`) out of the box, including typography, code blocks, tables, and callouts.

You can customize styles at two levels:

| Scope | File | Description |
|---|---|---|
| **Project-Wide** | `project.css` | Shared styles, custom `@page` sizes, margins, and running headers/footers |
| **Document-Specific** | `README.css` | Unique styles and overrides for the active document |

---

### Page Breaks in A4 Documents

To force a page break between sections in both the preview and exported PDF, use the built-in `.page-break` class:

```html
<div class="page-break"></div>
```

<!-- Page Break Demonstration -->
<div class="page-break"></div>

## 📄 Second Page Section

This section begins on page 2 because of the `<div class="page-break"></div>` above.

### Built-in Features

- **Live Synchronization:** Edits in Markdown or CSS trigger instant live-preview updates via Server-Sent Events (`SSE`).
- **Paged Media Engine:** Powered by `paged.js`, calculating true A4 pagination, margins, and page boxes.
- **True Print Output:** Uses `WeasyPrint` for pixel-accurate PDF generation.
- **Local Storage:** All files are saved as standard `.md` and `.css` files in your chosen local workspace.

---

## ⚙️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| **Save Document** | `Ctrl` + `S` / `Cmd` + `S` |
| **Toggle CSS Editor** | Click **🎨 CSS** in Toolbar |
| **Toggle Image Library** | Click **🖼 Library** in Toolbar |
| **Workspace Settings** | Click **⚙ Settings** in Toolbar |
