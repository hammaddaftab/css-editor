import { useEffect, type RefObject } from 'react';
import { initPreview } from '../preview.js';

export function usePreview(frame: RefObject<HTMLIFrameElement | null>, theme: string): void {
  useEffect(() => { initPreview(frame.current, theme); }, [frame]);
}
