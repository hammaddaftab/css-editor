import type { ChangeEvent, RefObject } from 'react';
import type { AppStatus, Project, ProjectFile, UserConfig } from '../app-types';

type Props = {
  projects: Project[];
  project: string;
  files: ProjectFile[];
  filename: string;
  dirty: boolean;
  status: AppStatus;
  statusTitle: string;
  exporting: boolean;
  settingsOpen: boolean;
  mode?: 'idle' | 'watch' | 'project';
  watchActive?: boolean;
  projectActive?: boolean;
  docPath?: string;
  activeWatchTarget?: { path: string; filename: string } | null;
  onOpenWatchFile: () => void;
  onSwitchToWatch?: () => void;
  onSwitchToProjects?: () => void;
  imageInput: RefObject<HTMLInputElement | null>;
  onProject: (event: ChangeEvent<HTMLSelectElement>) => void;
  onFile: (event: ChangeEvent<HTMLSelectElement>) => void;
  onExport: () => void;
  onLibrary: () => void;
  libraryVisible: boolean;
  onCss: () => void;
  cssVisible: boolean;
  onSettings: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function Toolbar(props: Props) {
  const projectOptions = props.projects.length
    ? props.projects.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)
    : <option value="">Loading projects…</option>;
  const fileOptions = props.files.map((item) => <option key={item.filename} value={item.filename}>{item.filename}</option>);

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <svg className="toolbar__brand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 1.5H3.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V5.5L9.5 1.5z" />
          <polyline points="9.5 1.5 9.5 5.5 13.5 5.5" />
          <line x1="5" y1="9" x2="11" y2="9" />
          <line x1="5" y1="11.5" x2="9" y2="11.5" />
        </svg>
        <span className="toolbar__brand-text">CSS Editor</span>
      </div>

      <div className="toolbar__doc">
        {props.mode === 'idle' ? (
          <>
            <div className="doc-pill doc-pill--idle">
              <span className="doc-dot doc-dot--idle" />
              <span className="doc-name">Idle</span>
            </div>
            <button className="btn btn--ghost btn--xs" title="Open an external Markdown file to watch (Ctrl+O)" onClick={props.onOpenWatchFile}>
              Watch File…
            </button>
          </>
        ) : props.mode === 'watch' ? (
          <>
            <div className="doc-pill doc-pill--watch" title={`Watching external file: ${props.docPath}`}>
              <span className="doc-dot doc-dot--live" title="Live disk watch active" />
              <span className="doc-name" style={{ fontWeight: 600, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {props.filename}
              </span>
              <span className="badge-watch">WATCH</span>
              <span className={`doc-dirty${props.dirty ? ' is-dirty' : ''}`} title="Unsaved changes">●</span>
            </div>
            <button className="btn btn--ghost btn--xs" title="Open another file to watch (Ctrl+O)" onClick={props.onOpenWatchFile}>
              Open File…
            </button>
            {props.onSwitchToProjects && (
              <button
                className="btn btn--ghost btn--xs"
                title={props.projectActive ? "Switch to project" : "Select Project"}
                onClick={props.onSwitchToProjects}
              >
                {props.projectActive ? "Switch to project" : "Select Project"}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="doc-pill">
              <span className="doc-dot doc-dot--project" />
              <select className="doc-select" title="Project directory" value={props.project} onChange={props.onProject}>
                {projectOptions}
                <option value="__new__">New project…</option>
                <option value="__watch__">Watch file…</option>
              </select>
            </div>
            <div className="doc-pill">
              <select className="doc-select" title="Files in this project" value={props.filename} onChange={props.onFile}>
                {fileOptions}
                <option value="__new__">New file…</option>
              </select>
              <span className={`doc-dirty${props.dirty ? ' is-dirty' : ''}`} title="Unsaved changes (Ctrl+S or Settings)">●</span>
            </div>
            {props.watchActive ? (
              props.onSwitchToWatch && (
                <button
                  className="btn btn--ghost btn--xs"
                  title="Switch to watch"
                  onClick={props.onSwitchToWatch}
                >
                  Switch to watch
                </button>
              )
            ) : (
              <button
                className="btn btn--ghost btn--xs"
                title="Select Standalone"
                onClick={props.onOpenWatchFile}
              >
                Select Standalone
              </button>
            )}
          </>
        )}
      </div>

      <div className="toolbar__actions">
        <span className={`status status--${props.status}`} title={props.statusTitle} aria-label="SSE status" />
        <button className={`btn btn--ghost${props.libraryVisible ? ' active' : ''}`} title="Toggle Image Library" onClick={props.onLibrary}>
          Library
        </button>
        <button className={`btn btn--ghost${props.cssVisible ? ' active' : ''}`} title="Toggle CSS panel" onClick={props.onCss}>
          CSS
        </button>
        <button
          className={`btn btn--ghost${props.settingsOpen ? ' active' : ''}`}
          title="Settings & Workspace"
          aria-expanded={props.settingsOpen}
          onClick={props.onSettings}
        >
          Settings
        </button>
        <input ref={props.imageInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" style={{ display: 'none' }} multiple />
        <button
          className="btn btn--primary"
          disabled={props.mode === 'idle' || props.exporting}
          style={props.mode === 'idle' ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          onClick={props.onExport}
        >
          {props.exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
    </header>
  );
}
