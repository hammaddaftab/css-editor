import type { RefObject } from 'react';

export type Mode =
  | { watch: false; project: false }
  | { watch: true;  project: false }
  | { watch: false; project: true }
  | { watch: true;  project: true; focus: 'watch' | 'project' };

export type WorkspaceSession =
  | { watch: false; project: false }
  | { watch: true; project: false; path: string; customCss?: string }
  | { watch: false; project: true; project: string; file: string }
  | {
      watch: true;
      project: true;
      focus: 'watch' | 'project';
      path: string;
      customCss?: string;
      project: string;
      file: string;
    };

export type TargetSpec =
  | { mode: 'idle' }
  | { mode: 'watch'; path: string; customCss?: string }
  | { mode: 'project'; project: string; filename: string };

export type WorkspaceProject = {
  name: string;
  path: string;
  documents: Array<{ filename: string; size: number; mtime: number }>;
};

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
  anonymous_id?: string;
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
