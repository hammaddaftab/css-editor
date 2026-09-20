import type { RefObject } from 'react';

export interface ImageItem {
  filename: string;
  url: string;
  size: number;
  rel_path?: string;
}

export interface ImageLibraryHandle {
  fetchImages: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<ImageItem[]>;
  focusImage: (url: string | null) => void;
  selectImage: (filename: string) => void;
  clearSelection: () => void;
  setDoc: (docPath: string) => Promise<void>;
  toggle: (show?: boolean) => void;
}

export interface ImageLibraryProps {
  docPath?: string;
  visible?: boolean;
  noCrop?: boolean;
  noWhitespace?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  onInsert?: (snippet: string) => void;
  onRename?: (oldFilename: string, newFilename: string, oldPath?: string, newPath?: string) => void;
}
