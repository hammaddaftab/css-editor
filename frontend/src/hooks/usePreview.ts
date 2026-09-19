import { useEffect, type RefObject } from 'react';
import { initPreview } from '../preview.js';

export function usePreview(
  frameA: RefObject<HTMLIFrameElement | null>,
  frameB: RefObject<HTMLIFrameElement | null>,
  previewScroll: RefObject<HTMLDivElement | null>,
  theme: string,
  onPageCount?: (count: string) => void,
): void {
  useEffect(() => {
    initPreview(
      { frameA: frameA.current, frameB: frameB.current, scrollEl: previewScroll.current },
      theme,
      onPageCount,
    );
  }, [frameA, frameB, previewScroll, onPageCount]);
}
