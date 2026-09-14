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

  return { theme, settingsOpen, noCrop, noWhitespace, setSettingsOpen, changeTheme, changeNoCrop, changeNoWhitespace };
}
