# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification file for CSS Markdown Editor.

Bundles:
  - CLI entrypoint (app/cli.py)
  - Static assets (static/) and HTML templates (templates/)
  - WeasyPrint data files and dynamic C libraries (Pango, HarfBuzz, Fontconfig)
  - Uvicorn and Markdown-it runtime hidden imports
"""
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

block_cipher = None
project_root = Path('.').resolve()

# 1. Collect application static assets and HTML templates
datas = [
    (str(project_root / 'static'), 'static'),
    (str(project_root / 'templates'), 'templates'),
]

# Collect any data files associated with weasyprint
try:
    datas += collect_data_files('weasyprint')
except Exception:
    pass

# 2. Collect C shared libraries for WeasyPrint (Pango, HarfBuzz, Fontconfig, GObject)
binaries = []
try:
    binaries += collect_dynamic_libs('weasyprint')
except Exception:
    pass

# 3. Dynamic runtime imports that static analysis might miss
hiddenimports = [
    # Uvicorn internal modules
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',

    # Markdown-it and plugins
    'markdown_it',
    'mdit_py_plugins',
    'mdit_py_plugins.front_matter',
    'mdit_py_plugins.footnote',
    'mdit_py_plugins.tasklists',
    'mdit_py_plugins.deflist',

    # WeasyPrint submodules
    'weasyprint',
    'weasyprint.css',
    'weasyprint.text',
    'weasyprint.text.ffi',
    'weasyprint.draw',

    # Pydantic settings
    'pydantic_settings',
]

a = Analysis(
    ['app/cli.py'],
    pathex=[str(project_root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'IPython', 'jupyter'],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='css-editor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
