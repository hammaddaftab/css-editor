import type { RefObject } from 'react';

export type Project = { name: string; documents: number };
export type ProjectFile = { filename: string; size: number; mtime: number };
export type AppStatus = 'idle' | 'connected' | 'rendering' | 'error';
export type Conflict = {
  filename: string;
  markdown?: string;
  css?: string;
  project_css?: string;
  html?: string;
};

export type EditorView = any;
export type ImageLibrary = any;

export type WorkspaceRefs = {
  markdownHost: RefObject<HTMLDivElement | null>;
  cssHost: RefObject<HTMLDivElement | null>;
  markdownView: RefObject<EditorView>;
  cssView: RefObject<EditorView>;
  imageInput: RefObject<HTMLInputElement | null>;
  imageLibrary: RefObject<ImageLibrary>;
};

export type LibraryRefs = {
  container: RefObject<any>;
  list: RefObject<any>;
  dropzone: RefObject<any>;
  count: RefObject<any>;
  uploadButton: RefObject<any>;
};
