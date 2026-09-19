import { useCallback, useState, type RefObject } from 'react';
import { setPreviewDocumentTheme } from '../preview.js';

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

export function usePreferences(frame: RefObject<HTMLIFrameElement | null>) {
  const [theme, setTheme] = useState(() => stored('css_editor_preview_theme', 'light'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noCrop, setNoCrop] = useState(() => stored('css_editor_nocrop', '0') === '1');
  const [noWhitespace, setNoWhitespace] = useState(() => stored('css_editor_nowhitespace', '0') === '1' && stored('css_editor_nocrop', '0') === '1');
  const [autosave, setAutosave] = useState(() => stored('css_editor_autosave', '1') !== '0');
  const [autosaveDelay, setAutosaveDelay] = useState(() => {
    const val = parseInt(stored('css_editor_autosave_delay', '1000'), 10);
    return isNaN(val) ? 1000 : val;
  });

  const changeTheme = useCallback((value: string) => {
    const next = value === 'dark' ? 'dark' : 'light'; setTheme(next);
    try { localStorage.setItem('css_editor_preview_theme', next); } catch { /* optional */ }
    setPreviewDocumentTheme(frame.current, next);
  }, [frame]);

  const changeNoCrop = useCallback((enabled: boolean) => {
    setNoCrop(enabled); if (!enabled) setNoWhitespace(false);
    try { localStorage.setItem('css_editor_nocrop', enabled ? '1' : '0'); localStorage.setItem('css_editor_nowhitespace', enabled ? stored('css_editor_nowhitespace', '0') : '0'); } catch { /* optional */ }
  }, []);

  const changeNoWhitespace = useCallback((enabled: boolean) => {
    setNoWhitespace(enabled); try { localStorage.setItem('css_editor_nowhitespace', enabled ? '1' : '0'); } catch { /* optional */ }
  }, []);

  const changeAutosave = useCallback((enabled: boolean) => {
    setAutosave(enabled);
    try { localStorage.setItem('css_editor_autosave', enabled ? '1' : '0'); } catch { /* optional */ }
  }, []);

  const changeAutosaveDelay = useCallback((ms: number) => {
    setAutosaveDelay(ms);
    try { localStorage.setItem('css_editor_autosave_delay', String(ms)); } catch { /* optional */ }
  }, []);

  return {
    theme, settingsOpen, noCrop, noWhitespace, autosave, autosaveDelay,
    setSettingsOpen, changeTheme, changeNoCrop, changeNoWhitespace, changeAutosave, changeAutosaveDelay,
  };
}
