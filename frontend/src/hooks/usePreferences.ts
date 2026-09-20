import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { setPreviewDocumentTheme } from '../preview.js';
import type { UserConfig } from '../app-types';

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

async function persistPreferences(patch: {
  preview_theme?: string;
  library_open?: boolean;
  css_open?: boolean;
  preview_open?: boolean;
  no_crop?: boolean;
  no_whitespace?: boolean;
}) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.warn('Failed to persist preferences to config.json:', err);
  }
}

export function usePreferences(
  frame: RefObject<HTMLIFrameElement | null>,
  config?: UserConfig | null,
) {
  const [theme, setTheme] = useState(() => stored('css_editor_preview_theme', 'light'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(() => stored('css_editor_library_open', '1') !== '0');
  const [cssVisible, setCssVisible] = useState(() => stored('css_editor_css_open', '1') !== '0');
  const [previewVisible, setPreviewVisible] = useState(() => stored('css_editor_preview_open', '1') !== '0');
  const [noCrop, setNoCrop] = useState(() => stored('css_editor_nocrop', '0') === '1');
  const [noWhitespace, setNoWhitespace] = useState(() => stored('css_editor_nowhitespace', '0') === '1' && stored('css_editor_nocrop', '0') === '1');
  const [autosave, setAutosave] = useState(() => stored('css_editor_autosave', '1') !== '0');
  const [autosaveDelay, setAutosaveDelay] = useState(() => {
    const val = parseInt(stored('css_editor_autosave_delay', '1000'), 10);
    return isNaN(val) ? 1000 : val;
  });

  const initialSyncDone = useRef(false);

  useEffect(() => {
    if (!config || initialSyncDone.current) return;
    initialSyncDone.current = true;

    let patchNeeded: Record<string, any> | null = null;

    // Preview theme sync
    if (config.preview_theme) {
      if (config.preview_theme !== theme) {
        setTheme(config.preview_theme);
        try { localStorage.setItem('css_editor_preview_theme', config.preview_theme); } catch { /* optional */ }
        setPreviewDocumentTheme(frame.current, config.preview_theme);
      }
    } else if (theme !== 'light') {
      patchNeeded = patchNeeded || {};
      patchNeeded.preview_theme = theme;
    }

    // Library tab sync
    if (typeof config.library_open === 'boolean') {
      if (config.library_open !== libraryVisible) {
        setLibraryVisible(config.library_open);
        try { localStorage.setItem('css_editor_library_open', config.library_open ? '1' : '0'); } catch { /* optional */ }
      }
    } else if (!libraryVisible) {
      patchNeeded = patchNeeded || {};
      patchNeeded.library_open = libraryVisible;
    }

    // CSS tab sync
    if (typeof config.css_open === 'boolean') {
      if (config.css_open !== cssVisible) {
        setCssVisible(config.css_open);
        try { localStorage.setItem('css_editor_css_open', config.css_open ? '1' : '0'); } catch { /* optional */ }
      }
    } else if (!cssVisible) {
      patchNeeded = patchNeeded || {};
      patchNeeded.css_open = cssVisible;
    }

    // Preview tab sync
    if (typeof config.preview_open === 'boolean') {
      if (config.preview_open !== previewVisible) {
        setPreviewVisible(config.preview_open);
        try { localStorage.setItem('css_editor_preview_open', config.preview_open ? '1' : '0'); } catch { /* optional */ }
      }
    } else if (!previewVisible) {
      patchNeeded = patchNeeded || {};
      patchNeeded.preview_open = previewVisible;
    }

    // No-crop sync
    if (typeof config.no_crop === 'boolean') {
      if (config.no_crop !== noCrop) {
        setNoCrop(config.no_crop);
        try { localStorage.setItem('css_editor_nocrop', config.no_crop ? '1' : '0'); } catch { /* optional */ }
      }
    } else if (noCrop) {
      patchNeeded = patchNeeded || {};
      patchNeeded.no_crop = noCrop;
    }

    // No-whitespace sync
    if (typeof config.no_whitespace === 'boolean') {
      if (config.no_whitespace !== noWhitespace) {
        setNoWhitespace(config.no_whitespace);
        try { localStorage.setItem('css_editor_nowhitespace', config.no_whitespace ? '1' : '0'); } catch { /* optional */ }
      }
    } else if (noWhitespace) {
      patchNeeded = patchNeeded || {};
      patchNeeded.no_whitespace = noWhitespace;
    }

    if (patchNeeded) {
      void persistPreferences(patchNeeded);
    }
  }, [config, theme, libraryVisible, cssVisible, previewVisible, noCrop, noWhitespace, frame]);

  const changeTheme = useCallback((value: string) => {
    const next = value === 'dark' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem('css_editor_preview_theme', next); } catch { /* optional */ }
    setPreviewDocumentTheme(frame.current, next);
    void persistPreferences({ preview_theme: next });
  }, [frame]);

  const toggleLibrary = useCallback((override?: boolean | unknown) => {
    setLibraryVisible((prev) => {
      const next = typeof override === 'boolean' ? override : !prev;
      try { localStorage.setItem('css_editor_library_open', next ? '1' : '0'); } catch { /* optional */ }
      void persistPreferences({ library_open: next });
      return next;
    });
  }, []);

  const toggleCss = useCallback((override?: boolean | unknown) => {
    setCssVisible((prev) => {
      const next = typeof override === 'boolean' ? override : !prev;
      try { localStorage.setItem('css_editor_css_open', next ? '1' : '0'); } catch { /* optional */ }
      void persistPreferences({ css_open: next });
      return next;
    });
  }, []);

  const togglePreview = useCallback((override?: boolean | unknown) => {
    setPreviewVisible((prev) => {
      const next = typeof override === 'boolean' ? override : !prev;
      try { localStorage.setItem('css_editor_preview_open', next ? '1' : '0'); } catch { /* optional */ }
      void persistPreferences({ preview_open: next });
      return next;
    });
  }, []);

  const changeNoCrop = useCallback((enabled: boolean) => {
    setNoCrop(enabled);
    const nextWhitespace = enabled ? stored('css_editor_nowhitespace', '0') === '1' : false;
    if (!enabled) setNoWhitespace(false);
    try {
      localStorage.setItem('css_editor_nocrop', enabled ? '1' : '0');
      localStorage.setItem('css_editor_nowhitespace', nextWhitespace ? '1' : '0');
    } catch { /* optional */ }
    void persistPreferences({ no_crop: enabled, no_whitespace: nextWhitespace });
  }, []);

  const changeNoWhitespace = useCallback((enabled: boolean) => {
    setNoWhitespace(enabled);
    try { localStorage.setItem('css_editor_nowhitespace', enabled ? '1' : '0'); } catch { /* optional */ }
    void persistPreferences({ no_whitespace: enabled });
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
    theme,
    settingsOpen,
    libraryVisible,
    cssVisible,
    previewVisible,
    noCrop,
    noWhitespace,
    autosave,
    autosaveDelay,
    setSettingsOpen,
    changeTheme,
    toggleLibrary,
    toggleCss,
    togglePreview,
    setLibraryVisible,
    setCssVisible,
    setPreviewVisible,
    changeNoCrop,
    changeNoWhitespace,
    changeAutosave,
    changeAutosaveDelay,
  };
}
