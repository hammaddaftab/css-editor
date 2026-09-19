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
          <h1 className="idle-title">Select an Editing Mode</h1>
          <p className="idle-subtitle">
            Choose your workflow to begin. You can switch modes at any time in Settings.
          </p>
        </div>

        <div className="idle-cards">
          {/* CARD 1: PROJECT WORKSPACE */}
          <div className="idle-card idle-card--project">
            <div className="idle-card__header">
              <div className="idle-card__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="idle-card__icon-svg">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
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
                    Open Project
                  </button>
                )}
                <button
                  type="button"
                  className={`btn ${props.projects.length === 0 ? 'btn--primary' : 'btn--secondary'} idle-btn-sec`}
                  onClick={props.onCreateProject}
                >
                  New Project…
                </button>
              </div>
            </div>
          </div>

          {/* CARD 2: STANDALONE WATCH MODE */}
          <div className="idle-card idle-card--watch">
            <div className="idle-card__header">
              <div className="idle-card__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="idle-card__icon-svg">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            </div>
            <h2 className="idle-card__title">Standalone / Watch Mode</h2>
            <p className="idle-card__desc">
              Write in your external editor (Neovim, VS Code, Obsidian) with atomic-safe live reload, zero project style bleeding, and PDF export.
            </p>

            <div className="idle-card__actions">
              <div className="idle-btn-group">
                {props.activeWatchTarget ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--primary idle-btn-main"
                      title={`Jump to watched file: ${props.activeWatchTarget.path}`}
                      onClick={props.onSwitchToWatch}
                    >
                      Watch: {props.activeWatchTarget.filename}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary idle-btn-sec"
                      title="Open a different external Markdown file"
                      onClick={props.onOpenWatchFile}
                    >
                      Open Other File…
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary idle-btn-main"
                    onClick={props.onOpenWatchFile}
                  >
                    Open File to Watch…
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
