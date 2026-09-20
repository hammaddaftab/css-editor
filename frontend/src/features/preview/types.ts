import type { RefObject } from 'react';

export interface PreviewTargetDouble {
  frameA: HTMLIFrameElement;
  frameB: HTMLIFrameElement;
  scrollEl?: HTMLElement | null;
  onSwap?: (active: 'A' | 'B') => void;
}

export type PreviewTarget =
  | PreviewTargetDouble
  | HTMLIFrameElement
  | (HTMLIFrameElement & { scrollEl?: HTMLElement | null });

export interface PreviewPaneProps {
  frameA: RefObject<HTMLIFrameElement | null>;
  frameB: RefObject<HTMLIFrameElement | null>;
  activeFrame: 'A' | 'B';
  previewScroll: RefObject<HTMLDivElement | null>;
  pageCount: string;
  theme: string;
  onTheme: (theme: string) => void;
}
