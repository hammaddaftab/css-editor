import { useState, useEffect } from 'react';
import type { Project } from '../app-types';

type Props = {
  projects: Project[];
  activeWatchTarget?: { path: string; filename: string } | null;
  onOpenWatchFile: () => void;
  onSelectProject: (projectName: string) => Promise<void> | void;
  onCreateProject: () => Promise<void> | void;
  onSwitchToWatch: () => Promise<void> | void;
};

export function IdleLauncher(props: Props) {
  const [selectedProject, setSelectedProject] = useState('');

  useEffect(() => {
    if (props.projects.length > 0 && !selectedProject) {
      setSelectedProject(props.projects[0].name);
    }
  }, [props.projects, selectedProject]);

  return (
    <div className="idle-overlay" role="dialog" aria-modal="true" aria-label="Select an editing mode">
      <div className="idle-container">
        <div className="idle-header">
          <div className="idle-badge">CSS MARKDOWN EDITOR</div>
          <h1 className="idle-title">Select an Editing Mode</h1>
          <p className="idle-subtitle">
            Choose your workflow to begin. No default mode is forced.
          </p>
        </div>

        <div className="idle-cards">
          {/* CARD 1: PROJECT MODE */}
          <div className="idle-card idle-card--project">
            <div className="idle-card__header">
              <span className="idle-card__icon">📦</span>
              <span className="idle-card__badge">Managed Publication</span>
            </div>
            <h2 className="idle-card__title">Project Workspace</h2>
            <p className="idle-card__desc">
              Draft multi-page publications, reports, or books with shared <code>project.css</code> stylesheets and a managed image asset library.
            </p>

            <div className="idle-card__actions">
              {props.projects.length > 0 ? (
                <div className="idle-project-select-row">
                  <label className="idle-label" htmlFor="idle-project-select">
                    Available Project:
                  </label>
                  <select
                    id="idle-project-select"
                    className="idle-select"
                    value={selectedProject || props.projects[0]?.name || ''}
                    onChange={(e) => setSelectedProject(e.target.value)}
                  >
                    {props.projects.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.documents} {p.documents === 1 ? 'document' : 'documents'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="idle-empty-projects">
                  No projects created yet. Create a new one below.
                </div>
              )}

              <div className="idle-btn-group">
                {props.projects.length > 0 && (
                  <button
                    type="button"
                    className="btn btn--primary idle-btn-main"
                    onClick={() => props.onSelectProject(selectedProject || props.projects[0].name)}
                  >
                    📦 Open Project
                  </button>
                )}
                <button
                  type="button"
                  className={`btn ${props.projects.length === 0 ? 'btn--primary' : 'btn--ghost'} idle-btn-sec`}
                  onClick={props.onCreateProject}
                >
                  ＋ New Project…
                </button>
              </div>
            </div>
          </div>

          {/* CARD 2: STANDALONE WATCH MODE */}
          <div className="idle-card idle-card--watch">
            <div className="idle-card__header">
              <span className="idle-card__icon">👁</span>
              <span className="idle-card__badge idle-card__badge--watch">Live Companion</span>
            </div>
            <h2 className="idle-card__title">Standalone / Watch Mode</h2>
            <p className="idle-card__desc">
              Write in your external editor (Neovim, VS Code, Obsidian) with atomic-safe live reload, zero project style bleeding, and PDF export.
            </p>

            <div className="idle-card__actions">
              <div className="idle-btn-group">
                <button
                  type="button"
                  className="btn btn--primary idle-btn-main"
                  onClick={props.onOpenWatchFile}
                >
                  👁 Open File to Watch…
                </button>
                {props.activeWatchTarget && (
                  <button
                    type="button"
                    className="btn btn--ghost idle-btn-sec"
                    title={`Resume watching ${props.activeWatchTarget.path}`}
                    onClick={props.onSwitchToWatch}
                  >
                    Resume: {props.activeWatchTarget.filename}
                  </button>
                )}
              </div>
              <div className="idle-shortcut-hint">
                External file picker shortcut: <kbd>Ctrl</kbd> + <kbd>O</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
