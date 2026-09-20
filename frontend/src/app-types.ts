/**
 * ## Watch / Project Mode State Machine
 *
 * ```mermaid
 * stateDiagram-v2
 *     [*] --> NoneActive
 *
 *     NoneActive --> WatchOnly : init_watch (select file)
 *     NoneActive --> ProjectOnly : init_project (select project)
 *
 *     WatchOnly --> Both_projectFocus : init_project (select project)
 *     ProjectOnly --> Both_watchFocus : init_watch (select file)
 *
 *     Both_watchFocus --> Both_projectFocus : switch_to_project
 *     Both_projectFocus --> Both_watchFocus : switch_to_watch
 * ```
 *
 * The app can be in one of four modes with respect to Watch (standalone file) and Project selection: neither active, only one active, or both active with one in focus.
 *
 * **States**
 *
 * - `NoneActive` — initial state; neither Watch nor Project mode is active.
 * - `WatchOnly` — a file has been selected via Watch mode; Project mode is inactive.
 * - `ProjectOnly` — a project has been selected; Watch mode is inactive.
 * - `Both_watchFocus` — both modes are active; Watch is currently in focus (visible).
 * - `Both_projectFocus` — both modes are active; Project is currently in focus (visible).
 *
 * **Transitions**
 *
 * - `init_watch` (Select Standalone) — from `NoneActive` activates Watch mode (`WatchOnly`). From `ProjectOnly`, it activates Watch *in addition to* Project, and shifts focus to Watch (`Both_watchFocus`).
 * - `init_project` (Select Project) — from `NoneActive` activates Project mode (`ProjectOnly`). From `WatchOnly`, it activates Project *in addition to* Watch, and shifts focus to Project (`Both_projectFocus`).
 * - `switch_to_watch` / `switch_to_project` — only available once both modes are active; toggles which mode is currently focused without deactivating either.
 *
 * **Key rule: once both modes are active, neither can be deactivated.** There is no transition back to `WatchOnly`, `ProjectOnly`, or `NoneActive` from either `Both_*` state. Selecting a file or project while already in a `Both_*` state does not create a new mode — it's a no-op with respect to activation, since both are already on.
 *
 * **Focus-follows-activation:** activating the second mode always brings it into focus immediately (you see what you just selected), rather than requiring a separate manual switch to reveal it. Once both are active, focus is controlled explicitly via `switch_to_watch` / `switch_to_project`.
 */
import type { RefObject } from 'react';

export type Mode =
  | { watch: false; project: false }
  | { watch: true;  project: false }
  | { watch: false; project: true }
  | { watch: true;  project: true; focus: 'watch' | 'project' };

export type WorkspaceSession =
  | { watch: false; project: false }
  | { watch: true; project: false; path: string; customCss?: string }
  | { watch: false; project: true; projectName: string; file: string }
  | {
      watch: true;
      project: true;
      focus: 'watch' | 'project';
      path: string;
      customCss?: string;
      projectName: string;
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
  preview_theme?: 'light' | 'dark';
  library_open?: boolean;
  css_open?: boolean;
  preview_open?: boolean;
  no_crop?: boolean;
  no_whitespace?: boolean;
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
