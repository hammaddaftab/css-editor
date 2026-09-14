"""
Native OS directory selection dialogs.

Provides cross-platform directory picking:
  - Linux: zenity (if graphical display is present)
  - macOS: AppleScript via osascript
  - Windows: PowerShell FolderBrowserDialog

Returns (chosen_path, error_or_reason).
If native dialog is unavailable or cancelled, returns (None, reason).
"""
import asyncio
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _pick_directory_sync(initial_dir: str | None = None) -> tuple[str | None, str | None]:
    """Synchronous native directory picker."""
    initial = str(Path(initial_dir).expanduser().resolve()) if initial_dir else ""

    if sys.platform.startswith("linux"):
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        if not has_display:
            return None, "No graphical display detected (running headlessly)."

        zenity = shutil.which("zenity")
        if zenity:
            cmd = [zenity, "--file-selection", "--directory", "--title=Select Projects Directory"]
            if initial and Path(initial).is_dir():
                cmd.append(f"--filename={initial}/")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if result.returncode == 0:
                    chosen = result.stdout.strip()
                    if chosen:
                        return chosen, None
                return None, "Directory selection cancelled."
            except subprocess.TimeoutExpired:
                return None, "Directory picker timed out."
            except Exception as exc:
                logger.debug("Zenity error: %s", exc)
                return None, str(exc)

        return None, "Zenity not found on system."

    elif sys.platform.startswith("darwin"):
        script = 'POSIX path of (choose folder with prompt "Select Projects Directory")'
        try:
            result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                chosen = result.stdout.strip().rstrip("/")
                if chosen:
                    return chosen, None
            return None, "Directory selection cancelled."
        except Exception as exc:
            logger.debug("macOS dialog error: %s", exc)
            return None, str(exc)

    elif sys.platform.startswith("win"):
        ps_cmd = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$f.Description = 'Select Projects Directory'; "
            "if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }"
        )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                chosen = result.stdout.strip()
                if chosen:
                    return chosen, None
            return None, "Directory selection cancelled."
        except Exception as exc:
            logger.debug("Windows dialog error: %s", exc)
            return None, str(exc)

    return None, "Platform not supported for native directory selection."


async def pick_directory(initial_dir: str | None = None) -> tuple[str | None, str | None]:
    """Asynchronous wrapper for native folder picker."""
    return await asyncio.to_thread(_pick_directory_sync, initial_dir)


def is_dialog_supported() -> bool:
    """Check if native dialog can likely be launched in current environment."""
    if sys.platform.startswith("linux"):
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        return has_display and bool(shutil.which("zenity"))
    elif sys.platform.startswith("darwin"):
        return bool(shutil.which("osascript"))
    elif sys.platform.startswith("win"):
        return bool(shutil.which("powershell"))
    return False
