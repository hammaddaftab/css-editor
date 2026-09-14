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

export type UserConfig = {
  projects_dir: string;
  default_projects_dir: string;
  app_projects_dir: string;
  author_name: string;
  author_email: string;
  first_run_completed: boolean;
  welcome_seeded: boolean;
  is_first_run: boolean;
  config_file_path: string;
  projects_dir_exists: boolean;
  dialog_supported: boolean;
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
