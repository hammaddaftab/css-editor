import { useEffect, useRef } from 'react';

interface WorkspaceForAutosave {
  dirty: boolean;
  markdown: string;
  css: string;
  target: { mode: string };
  current: {
    current: {
      dirty: boolean;
      target: { mode: string };
      markdown: string;
      css: string;
    };
  };
  saveDocument: (
    override?: { filename?: string; markdown?: string; css?: string },
    options?: { isAutosave?: boolean },
  ) => Promise<void>;
}

export function useAutosave(
  workspace: WorkspaceForAutosave,
  enabled: boolean,
  delay: number = 1000,
): void {
  const { dirty, markdown, css, target, current, saveDocument } = workspace;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave after user pauses typing
  useEffect(() => {
    if (!enabled || !dirty || target.mode === 'idle') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const active = current.current;
      if (active.dirty && active.target.mode !== 'idle') {
        void saveDocument(undefined, { isAutosave: true });
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, dirty, markdown, css, delay, target.mode, saveDocument, current]);

  // Immediate save on window blur, visibility change, or page unload
  useEffect(() => {
    if (!enabled) return;

    const flushSave = () => {
      const active = current.current;
      if (active.dirty && active.target.mode !== 'idle') {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void saveDocument(undefined, { isAutosave: true });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };

    const handleWindowBlur = () => {
      flushSave();
    };

    const handleBeforeUnload = () => {
      flushSave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, current, saveDocument]);
}
