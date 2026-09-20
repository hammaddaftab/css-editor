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
 * The app can be in one of four modes with respect to Watch (standalone file) and Project selection:
 * neither active, only one active, or both active with one in focus.
 */

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

export type Conflict = {
  filename: string;
  markdown?: string;
  css?: string;
  project_css?: string;
  html?: string;
};
