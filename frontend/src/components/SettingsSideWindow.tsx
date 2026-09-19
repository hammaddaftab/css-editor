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
