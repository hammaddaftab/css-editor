// Type definitions for the editor feature

import type { RefObject } from 'react';
import type { EditorView } from 'codemirror';
import type { ImageLibraryHandle } from '../image-library';

export interface EditorWorkspaceRefs {
  markdownHost: RefObject<HTMLDivElement | null>;
  cssHost: RefObject<HTMLDivElement | null>;
  markdownView: RefObject<EditorView | null>;
  cssView: RefObject<EditorView | null>;
  imageLibrary?: RefObject<ImageLibraryHandle | null>;
}

export interface UseEditorsOptions {
  refs: EditorWorkspaceRefs;
  updateMarkdown: (text: string) => void;
  updateCss: (text: string) => void;
  saveDocument: () => Promise<void> | void;
}

export interface MarkdownEditorOptions {
  doc?: string;
  onImageVicinity?: (url: string | null) => void;
  onDropImage?: (imgData: any) => void;
  onPasteImage?: (file: File) => Promise<any>;
  onSave?: () => void;
}

export interface CssEditorOptions {
  doc?: string;
  onSave?: () => void;
}
