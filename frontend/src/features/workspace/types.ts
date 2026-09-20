import type { RefObject } from 'react';
import type { EditorView } from 'codemirror';
import type { ImageLibraryHandle } from '../image-library';
import type { Conflict } from '../../entities';

export interface WorkspaceRefs {
  markdownHost: RefObject<HTMLDivElement | null>;
  cssHost: RefObject<HTMLDivElement | null>;
  markdownView: RefObject<EditorView | null>;
  cssView: RefObject<EditorView | null>;
  imageInput: RefObject<HTMLInputElement | null>;
  imageLibrary: RefObject<ImageLibraryHandle | null>;
}

export interface ConflictBannerProps {
  conflict: Conflict;
  onReload: () => void;
  onKeep: () => void;
}

export interface WorkspacePanesProps {
  panes: RefObject<HTMLDivElement | null>;
  divider: RefObject<HTMLDivElement | null>;
  leftPane: RefObject<HTMLDivElement | null>;
  libraryVisible: boolean;
  cssVisible: boolean;
  previewVisible: boolean;
  noCrop: boolean;
  noWhitespace: boolean;
  docPath?: string;
  imageLibraryRef?: RefObject<ImageLibraryHandle | null>;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  onInsertImage?: (snippet: string) => void;
  onRenameImage?: (oldFilename: string, newFilename: string, oldPath?: string, newPath?: string) => void;
  refs?: WorkspaceRefs;
  markdownHost?: RefObject<HTMLDivElement | null>;
  cssHost?: RefObject<HTMLDivElement | null>;
  onCss: () => void;
  frameA: RefObject<HTMLIFrameElement | null>;
  frameB: RefObject<HTMLIFrameElement | null>;
  activeFrame: 'A' | 'B';
  previewScroll: RefObject<HTMLDivElement | null>;
  pageCount: string;
  theme: string;
  onTheme: (theme: string) => void;
}
