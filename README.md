# CSS Markdown Editor

A standalone, lightweight desktop CLI application for authoring beautifully formatted documents. Write in **Markdown**, style with **standard CSS**, preview in real-time with **multi-page A4 pagination (Paged.js)**, and export to **print-ready PDFs (WeasyPrint)**.

No cloud dependencies, no account needed, and zero configuration required.

---

## Features

- **Split-View Authoring:** Markdown editor and CSS stylesheet side-by-side with instant live updates.
- **True Multi-Page A4 Preview:** Powered by Paged.js polyfill inside an isolated iframe, rendering genuine print margins, page counters, and running headers/footers.
- **Pixel-Perfect PDF Export:** Server-side PDF generation using WeasyPrint with full support for CSS Paged Media module specs (`@page`, `@top-right`, `@bottom-center`, etc.).
- **External File Watching (`--watch`):** Edit in your favorite desktop editor (Neovim, VS Code, Obsidian) and see live hot-reloaded print previews instantly via Server-Sent Events (SSE).
- **Auto-Detect Port & Browser Launch:** Automatically selects a free port if the default (`8000`) is occupied and opens your default browser.
- **Standalone Binary:** Zero runtime dependencies required — no Python or Node.js installation necessary.

---

## Installation

### Method 1: Pre-built Standalone Binaries (Recommended)

Pre-compiled standalone executables are available for every release on the [GitHub Releases page](https://github.com/hammaddaftab/css-editor/releases).

#### 1. Linux (x86_64)

1. **Download & Extract:**
   ```bash
   curl -sL https://github.com/hammaddaftab/css-editor/releases/latest/download/css-editor-linux-x86_64.tar.gz | tar -xz && chmod +x css-editor
   ```

2. **Run:**
   ```bash
   ./css-editor
   ```

3. *(Optional)* **Add to PATH for system-wide access:**
   ```bash
   mkdir -p ~/.local/bin && mv css-editor ~/.local/bin/
   ```

> **PDF Engine Requirements:** WeasyPrint requires Cairo & Pango libraries:
> - **Debian / Ubuntu:** `sudo apt update && sudo apt install -y libpango-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 libharfbuzz0b`
> - **Fedora / RHEL:** `sudo dnf install -y pango cairo gdk-pixbuf2 harfbuzz`
> - **Arch Linux:** `sudo pacman -S pango cairo gdk-pixbuf2 harfbuzz`

---

#### 2. macOS (Apple Silicon: M1 / M2 / M3 / M4)

1. **Download & Extract:**
   ```bash
   curl -sL https://github.com/hammaddaftab/css-editor/releases/latest/download/css-editor-macos-arm64.tar.gz | tar -xz && chmod +x css-editor
   ```

2. **Run:**
   ```bash
   ./css-editor
   ```

3. *(Optional)* **Add to PATH for system-wide access:**
   ```bash
   sudo mv css-editor /usr/local/bin/
   ```

> **PDF Engine Requirements:** Run `brew install pango cairo gdk-pixbuf libffi` if not already installed.

---

#### 3. Windows (x64)

1. **Download & Extract (PowerShell):**
   ```powershell
   Invoke-WebRequest -Uri "https://github.com/hammaddaftab/css-editor/releases/latest/download/css-editor-windows-x64.zip" -OutFile "css-editor.zip"
   Expand-Archive css-editor.zip -DestinationPath ".\css-editor"
   ```

2. **Run:**
   ```powershell
   .\css-editor\css-editor.exe
   ```

3. *(Optional)* **Add to PATH:** Move `css-editor.exe` to a permanent folder (e.g. `%LOCALAPPDATA%\Programs\css-editor`) and add that folder to your Windows `PATH` environment variable.

> **PDF Engine Requirements:** Install GTK3 runtime from [GTK for Windows Runtime](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases) or via MSYS2 (`pacman -S mingw-w64-x86_64-pango mingw-w64-x86_64-cairo`).

---

### Method 2: Running & Building from Source

If you want to contribute or build from source:

#### Prerequisites
- **Python 3.10+**
- **Node.js 18+ & npm**
- Cairo, Pango, and GDK-Pixbuf system libraries (see OS sections above)

#### 1. Clone Repository & Build Frontend
```bash
git clone https://github.com/hammaddaftab/css-editor.git
cd css-editor

# Build TypeScript / React frontend bundle
cd frontend
npm ci
npm run build
cd ..
```

#### 2. Set Up Python Virtual Environment
```bash
python3 -m venv .venv

# On Linux / macOS:
source .venv/bin/activate

# On Windows (PowerShell):
# .venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install -r requirements-dev.txt
```

#### 3. Start Development Server
```bash
# Run the application CLI
python3 -m app.cli

# Or run with live FastAPI reload:
uvicorn app.main:app --reload
```

---

## CLI Usage & Options

```
usage: css-editor [-h] [--host HOST] [--port PORT] [--no-browser] [--watch WATCH] [--version]
```

### Options

| Flag | Default | Description |
| :--- | :--- | :--- |
| `-p`, `--port PORT` | `8000` | Port to listen on. If port 8000 is occupied, auto-detects the next free port. |
| `--host HOST` | `127.0.0.1` | Host interface to bind the local server. |
| `-w`, `--watch FILE` | `None` | Path to a local `.md` file on disk. Live syncs changes directly into the preview. |
| `--no-browser` | `false` | Disables automatically opening the default web browser on startup. |
| `-v`, `--version` | — | Prints application version and exits. |
| `-h`, `--help` | — | Displays the command-line help message. |

### Examples

```bash
# Start editor and open default browser automatically:
css-editor

# Watch an external markdown document on disk:
css-editor --watch ~/Documents/thesis-chapter1.md

# Run on a custom port without launching a browser:
css-editor --port 9090 --no-browser
```

---

## Configuration & Environment Variables

Default settings and projects are stored in standard user directories:
- **Projects Directory:** `~/Documents/CSS-Markdown-Editor/projects` (configurable via UI dialog or `config.json`)
- **Config Directory:** `~/.config/css-editor` (Linux) / `~/Library/Application Support/css-editor` (macOS) / `%APPDATA%\css-editor` (Windows)

Optional environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EDITOR_CONFIG_DIR` | OS configuration directory | Directory containing global user `config.json`. |
| `EDITOR_WATCH_FILE` | `unset` | Path to an external markdown file to monitor on disk. |
| `EDITOR_DEBUG` | `false` | Enables FastAPI debug mode and verbose logging. |

---

## Testing & Packaging

### Run Test Suite
```bash
python3 -m unittest discover tests
```

### Build Standalone Executable Locally
You can produce the standalone executable bundle using the PyInstaller blueprint:
```bash
pip install pyinstaller pyinstaller-hooks-contrib
python -m PyInstaller --clean css-editor.spec

# Test the compiled binary
./dist/css-editor --version
```

---

## Architecture & Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **CLI & Web Engine** | FastAPI + Uvicorn | High-performance ASGI web server & HTTP routing |
| **Markdown Parsing** | `markdown-it-py` + plugins | CommonMark parser with footnotes, tables, and linkify |
| **PDF Generation** | WeasyPrint | W3C-compliant CSS Paged Media rendering engine |
| **Print Preview** | Paged.js | In-browser A4 pagination polyfill in an isolated iframe |
| **Code Editor** | CodeMirror 6 | Dual-pane syntax highlighting for Markdown & CSS |
| **Hot Reload** | `watchfiles` + SSE | Low-latency file watcher pushing events over Server-Sent Events |
| **Packaging** | PyInstaller | Single-file, zero-dependency executable bundling |

---

## License

MIT License. See [LICENSE](LICENSE) for details.
