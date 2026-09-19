import { useEffect, type ChangeEvent } from 'react';
import type { UserConfig } from '../app-types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  config: UserConfig | null;
  onOpenConfigModal: () => void;
  noCrop: boolean;
  noWhitespace: boolean;
  onNoCrop: (event: ChangeEvent<HTMLInputElement>) => void;
  onNoWhitespace: (event: ChangeEvent<HTMLInputElement>) => void;
  autosave?: boolean;
  onAutosave?: (event: ChangeEvent<HTMLInputElement>) => void;
  theme?: string;
  onTheme?: (theme: string) => void;
  libraryVisible?: boolean;
  onLibraryToggle?: () => void;
  cssVisible?: boolean;
  onCssToggle?: () => void;
  mode?: 'idle' | 'watch' | 'project';
  filename?: string;
  dirty?: boolean;
  saveStatus?: string;
  onSave?: () => void;
  onSwitchToIdle?: () => void;
};

export function SettingsSideWindow(props: Props) {
  useEffect(() => {
    if (!props.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.isOpen, props.onClose]);

  return (
    <>
      <div
        className={`side-window-backdrop${props.isOpen ? ' is-open' : ''}`}
        onClick={props.onClose}
        aria-hidden={!props.isOpen}
      />
      <aside
        className={`side-window${props.isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-label="Settings"
        aria-hidden={!props.isOpen}
      >
        <div className="side-window__header">
          <span className="side-window__title">Settings</span>
          <button
            type="button"
            className="side-window__close"
            onClick={props.onClose}
            title="Close settings (Esc)"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="side-window__body">
          {/* Document & Session Actions */}
          <section className="prefs-group">
            <h3 className="prefs-group__title">Document & Session</h3>
            <div className="prefs-group__card">
              {/* Autosave Option */}
              <div className="prefs-row">
                <div className="prefs-row__info">
                  <span className="prefs-row__title">Autosave</span>
                  <span className="prefs-row__desc">
                    Automatically save document changes to disk after a 1-second pause
                  </span>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    className="settings-toggle__input"
                    checked={props.autosave}
                    onChange={props.onAutosave}
                  />
                  <span className="settings-toggle__slider" />
                </label>
              </div>

              {/* Save Option */}
              <div className="prefs-row">
                <div className="prefs-row__info">
                  <span className="prefs-row__title">Save Document</span>
                  <span className="prefs-row__desc">
                    {props.mode === 'idle'
                      ? 'No active document loaded'
                      : props.dirty
                      ? props.autosave
                        ? `Saving edits shortly… (Ctrl+S to save now)`
                        : `Unsaved edits in ${props.filename || 'document'} (Ctrl+S)`
                      : props.saveStatus === 'Saved'
                      ? `All changes saved (${props.filename || 'document'})`
                      : `Synchronized with disk (Ctrl+S)`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--xs"
                  disabled={props.mode === 'idle'}
                  style={props.mode === 'idle' ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                  onClick={props.onSave}
                  title="Save document changes to disk (Ctrl+S)"
                >
                  Save
                </button>
              </div>

              {/* Launcher Option */}
              {props.onSwitchToIdle && (
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">Workflow Launcher</span>
                    <span className="prefs-row__desc">
                      {props.mode === 'watch'
                        ? 'Active: Live external file watcher'
                        : props.mode === 'project'
                        ? 'Active: Project workspace'
                        : 'Startup mode selection screen'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--xs"
                    onClick={() => {
                      props.onClose();
                      props.onSwitchToIdle?.();
                    }}
                    title="Return to startup mode selection launcher"
                  >
                    Open Launcher
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Workspace Group */}
          <section className="prefs-group">
            <h3 className="prefs-group__title">Workspace & Storage</h3>
            <div className="prefs-group__card">
              <div className="prefs-row prefs-row--column">
                <div className="prefs-row__info">
                  <span className="prefs-row__title">Projects Folder</span>
                  <span className="prefs-row__desc">Local directory for documents, CSS, and images</span>
                </div>
                <div className="prefs-path-badge" title={props.config?.projects_dir || 'Loading…'}>
                  {props.config?.projects_dir || 'Loading…'}
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                  onClick={() => {
                    props.onOpenConfigModal();
                  }}
                >
                  Change Workspace Folder…
                </button>
              </div>
            </div>
          </section>

          {/* Author Group */}
          {props.config?.author_name && (
            <section className="prefs-group">
              <h3 className="prefs-group__title">Author</h3>
              <div className="prefs-group__card">
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">{props.config.author_name}</span>
                    {props.config.author_email && (
                      <span className="prefs-row__desc">{props.config.author_email}</span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Image Library Group */}
          <section className="prefs-group">
            <h3 className="prefs-group__title">Image Library</h3>
            <div className="prefs-group__card">
              <div className="prefs-row">
                <div className="prefs-row__info">
                  <span className="prefs-row__title">No-crop mode</span>
                  <span className="prefs-row__desc">Display images contained without cropping edges</span>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    className="settings-toggle__input"
                    checked={props.noCrop}
                    onChange={props.onNoCrop}
                  />
                  <span className="settings-toggle__slider" />
                </label>
              </div>

              {props.noCrop && (
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">No white-space</span>
                    <span className="prefs-row__desc">Collapse fixed thumbnail card height</span>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      className="settings-toggle__input"
                      checked={props.noWhitespace}
                      onChange={props.onNoWhitespace}
                    />
                    <span className="settings-toggle__slider" />
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Appearance & Panels Group */}
          <section className="prefs-group">
            <h3 className="prefs-group__title">Appearance & Panels</h3>
            <div className="prefs-group__card">
              {props.theme && props.onTheme && (
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">Preview Desk Theme</span>
                    <span className="prefs-row__desc">Choose light or dark background for preview</span>
                  </div>
                  <div className="preview-theme-toggle" role="group" aria-label="Preview background theme">
                    <button
                      type="button"
                      className={`preview-theme-btn${props.theme === 'light' ? ' active' : ''}`}
                      onClick={() => props.onTheme?.('light')}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      className={`preview-theme-btn${props.theme === 'dark' ? ' active' : ''}`}
                      onClick={() => props.onTheme?.('dark')}
                    >
                      Dark
                    </button>
                  </div>
                </div>
              )}

              {props.onCssToggle && (
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">Custom CSS Tab</span>
                    <span className="prefs-row__desc">Show or collapse the custom CSS editor panel</span>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      className="settings-toggle__input"
                      checked={props.cssVisible ?? true}
                      onChange={props.onCssToggle}
                    />
                    <span className="settings-toggle__slider" />
                  </label>
                </div>
              )}

              {props.onLibraryToggle && (
                <div className="prefs-row">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">Image Library Tab</span>
                    <span className="prefs-row__desc">Show or collapse the image library sidebar panel</span>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      className="settings-toggle__input"
                      checked={props.libraryVisible ?? true}
                      onChange={props.onLibraryToggle}
                    />
                    <span className="settings-toggle__slider" />
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Configuration File Group */}
          {props.config?.config_file_path && (
            <section className="prefs-group">
              <h3 className="prefs-group__title">Configuration File</h3>
              <div className="prefs-group__card">
                <div className="prefs-row prefs-row--column">
                  <div className="prefs-row__info">
                    <span className="prefs-row__title">Configuration Path</span>
                    <span className="prefs-row__desc">Persistent settings stored on local disk</span>
                  </div>
                  <div className="prefs-path-badge" title={props.config.config_file_path}>
                    {props.config.config_file_path}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
