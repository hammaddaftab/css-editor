"""macOS dynamic library path resolver for Homebrew/MacPorts dependencies.

On macOS (especially Apple Silicon / macOS 11+ dyld cache), Python's
ctypes.util.find_library() does not search /opt/homebrew/lib or /usr/local/lib
by default. This causes CFFI/WeasyPrint to fail when loading GObject, Pango,
and HarfBuzz dylibs.
"""
from __future__ import annotations

import sys


def setup_macos_library_paths() -> None:
    """Patch ctypes.util.find_library on macOS to resolve Homebrew/MacPorts dylibs."""
    if sys.platform != "darwin":
        return

    import ctypes.util
    import os
    from pathlib import Path

    # Populate DYLD_FALLBACK_LIBRARY_PATH in os.environ for dyld / child processes
    existing_dyld = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    homebrew_paths = [
        "/opt/homebrew/lib",
        "/opt/homebrew/opt/glib/lib",
        "/opt/homebrew/opt/pango/lib",
        "/opt/homebrew/opt/cairo/lib",
        "/opt/homebrew/opt/harfbuzz/lib",
        "/opt/homebrew/opt/fontconfig/lib",
        "/usr/local/lib",
        "/usr/local/opt/glib/lib",
        "/usr/local/opt/pango/lib",
        "/opt/local/lib",
    ]
    valid_paths = [p for p in homebrew_paths if Path(p).is_dir()]
    if valid_paths:
        combined = ":".join(valid_paths)
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
            f"{combined}:{existing_dyld}" if existing_dyld else combined
        )

    orig_find_library = ctypes.util.find_library

    # Library search folders
    search_dirs: list[Path] = [
        Path("/opt/homebrew/lib"),
        Path("/opt/homebrew/opt/glib/lib"),
        Path("/opt/homebrew/opt/pango/lib"),
        Path("/opt/homebrew/opt/cairo/lib"),
        Path("/opt/homebrew/opt/harfbuzz/lib"),
        Path("/opt/homebrew/opt/fontconfig/lib"),
        Path("/usr/local/lib"),
        Path("/usr/local/opt/glib/lib"),
        Path("/usr/local/opt/pango/lib"),
        Path("/opt/local/lib"),
    ]

    # Map typical POSIX/Linux SONAMEs to macOS dylib filenames
    library_name_map: dict[str, list[str]] = {
        "libgobject-2.0-0": ["libgobject-2.0.0.dylib", "libgobject-2.0.dylib"],
        "gobject-2.0-0": ["libgobject-2.0.0.dylib", "libgobject-2.0.dylib"],
        "gobject-2.0": ["libgobject-2.0.0.dylib", "libgobject-2.0.dylib"],
        "libpango-1.0-0": ["libpango-1.0.0.dylib", "libpango-1.0.dylib"],
        "pango-1.0-0": ["libpango-1.0.0.dylib", "libpango-1.0.dylib"],
        "pango-1.0": ["libpango-1.0.0.dylib", "libpango-1.0.dylib"],
        "libharfbuzz-0": ["libharfbuzz.0.dylib", "libharfbuzz.dylib"],
        "harfbuzz": ["libharfbuzz.0.dylib", "libharfbuzz.dylib"],
        "libfontconfig-1": ["libfontconfig.1.dylib", "libfontconfig.dylib"],
        "fontconfig": ["libfontconfig.1.dylib", "libfontconfig.dylib"],
        "libpangoft2-1.0-0": ["libpangoft2-1.0.0.dylib", "libpangoft2-1.0.dylib"],
        "pangoft2-1.0-0": ["libpangoft2-1.0.0.dylib", "libpangoft2-1.0.dylib"],
        "libcairo-2": ["libcairo.2.dylib", "libcairo.dylib"],
        "cairo": ["libcairo.2.dylib", "libcairo.dylib"],
    }

    def patched_find_library(name: str) -> str | None:
        # First try standard lookup
        found = orig_find_library(name)
        if found:
            return found

        candidates = list(library_name_map.get(name, []))
        if not name.endswith(".dylib"):
            candidates.append(f"{name}.dylib")
        if not name.startswith("lib"):
            candidates.append(f"lib{name}.dylib")
            candidates.append(f"lib{name}.0.dylib")

        for d in search_dirs:
            if not d.is_dir():
                continue
            for cand in candidates:
                cand_path = d / cand
                if cand_path.is_file():
                    return str(cand_path)

        return None

    ctypes.util.find_library = patched_find_library
