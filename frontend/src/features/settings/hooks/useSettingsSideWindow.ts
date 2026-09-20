import { useEffect } from 'react';

export interface UseSettingsSideWindowOptions {
  isOpen: boolean;
  onClose: () => void;
}

export function useSettingsSideWindow({ isOpen, onClose }: UseSettingsSideWindowOptions) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}
