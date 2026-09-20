import type { WelcomeModalProps } from '../types';
import { useWelcomeForm } from '../hooks/useWelcomeForm';

export function WelcomeModal({
  config,
  isOpen,
  onClose,
  onSave,
  onBrowse,
  saving,
  browsing,
  error: initialError,
}: WelcomeModalProps) {
  const {
    projectsDir,
    setProjectsDir,
    authorName,
    setAuthorName,
    authorEmail,
    setAuthorEmail,
    error,
    handleSubmit,
    handleBrowse,
  } = useWelcomeForm({
    config,
    isOpen,
    onSave,
    onBrowse,
    onClose,
    error: initialError,
  });

  if (!isOpen) return null;

  const isFirstRun = Boolean(config?.is_first_run);

  return (
    <div className="modal-backdrop" onClick={isFirstRun ? undefined : onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <h2 className="modal-title">
                {isFirstRun ? 'Welcome to CSS Markdown Editor' : 'Workspace & Storage Settings'}
              </h2>
              <p className="modal-subtitle">
                {isFirstRun
                  ? 'Set up where your documents, companion stylesheets, and assets will be stored locally.'
                  : 'Manage your local projects directory and author information.'}
              </p>
            </div>
          </div>
          {!isFirstRun && (
            <button className="modal-close" onClick={onClose} aria-label="Close modal">
              ×
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="modal-alert modal-alert--error">{error}</div>}

          <div className="modal-field">
            <label className="modal-label" htmlFor="projects-dir-input">
              Projects Directory
            </label>
            <div className="modal-input-group">
              <input
                id="projects-dir-input"
                type="text"
                className="modal-input"
                value={projectsDir}
                onChange={(e) => setProjectsDir(e.target.value)}
                placeholder="/path/to/projects"
                required
              />
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleBrowse}
                disabled={browsing || saving}
                title="Browse folder via system dialog"
              >
                {browsing ? 'Browsing…' : 'Browse…'}
              </button>
            </div>

            <div className="modal-presets">
              <span className="modal-presets__label">Quick options:</span>
              {config?.default_projects_dir && (
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setProjectsDir(config.default_projects_dir)}
                >
                  Documents (Default)
                </button>
              )}
              {config?.app_projects_dir && (
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setProjectsDir(config.app_projects_dir)}
                >
                  App Repo Directory
                </button>
              )}
            </div>
            <p className="modal-hint">
              All Markdown files, companion CSS, and image uploads will be saved inside this directory.
              A starter project will be seeded if the directory is new.
            </p>
          </div>

          <div className="modal-field-row">
            <div className="modal-field">
              <label className="modal-label" htmlFor="author-name-input">
                Author Name <span className="modal-label-opt">(optional)</span>
              </label>
              <input
                id="author-name-input"
                type="text"
                className="modal-input"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. Jane Doe"
              />
              <p className="modal-hint">Embedded into PDF metadata when exporting.</p>
            </div>

            <div className="modal-field">
              <label className="modal-label" htmlFor="author-email-input">
                Author Email <span className="modal-label-opt">(optional)</span>
              </label>
              <input
                id="author-email-input"
                type="email"
                className="modal-input"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                placeholder="e.g. jane@example.com"
              />
            </div>
          </div>

          {config?.config_file_path && (
            <div className="modal-config-path">
              <span className="modal-config-path__label">Settings saved to:</span>
              <code>{config.config_file_path}</code>
            </div>
          )}

          <div className="modal-footer">
            {!isFirstRun && (
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isFirstRun ? 'Get Started →' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
