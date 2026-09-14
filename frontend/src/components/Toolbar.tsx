import type { ChangeEvent, RefObject } from 'react';
import type { AppStatus, Project, ProjectFile } from '../app-types';

type Props = {
  projects: Project[];
  project: string;
  files: ProjectFile[];
  filename: string;
  dirty: boolean;
  saveStatus: string;
  status: AppStatus;
  statusTitle: string;
  exporting: boolean;
  settingsOpen: boolean;
  noCrop: boolean;
  noWhitespace: boolean;
  imageInput: RefObject<HTMLInputElement | null>;
  onProject: (event: ChangeEvent<HTMLSelectElement>) => void;
  onFile: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSave: () => void;
  onExport: () => void;
  onLibrary: () => void;
  libraryVisible: boolean;
  onCss: () => void;
  cssVisible: boolean;
  onSettings: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onNoCrop: (event: ChangeEvent<HTMLInputElement>) => void;
  onNoWhitespace: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function Toolbar(props: Props) {
  const projectOptions = props.projects.length ? props.projects.map((item) => <option key={item.name} value={item.name}>{item.name}</option>) : <option value="">Loading projects…</option>;
  const fileOptions = props.files.map((item) => <option key={item.filename} value={item.filename}>{item.filename}</option>);
  return <header className="toolbar">
    <div className="toolbar__brand"><span className="toolbar__brand-icon">📄</span>CSS Markdown Editor</div>
    <div className="toolbar__doc">
      <div className="doc-pill"><span className="doc-icon">📦</span><select className="doc-select" title="Project directory" value={props.project} onChange={props.onProject}>{projectOptions}<option value="__new__">＋ New project…</option></select></div>
      <div className="doc-pill"><span className="doc-icon">📁</span><select className="doc-select" title="Files in this project" value={props.filename} onChange={props.onFile}>{fileOptions}<option value="__new__">＋ New file…</option></select><span className={`doc-dirty${props.dirty ? ' is-dirty' : ''}`} title="Unsaved changes">●</span></div>
      <button className="btn btn--ghost btn--xs" title="Save to this project (Ctrl+S)" onClick={props.onSave}>💾 Save</button><span className={`save-status${props.saveStatus === 'Saved' ? ' is-saved' : ''}`}>{props.saveStatus}</span>
    </div>
    <div className="toolbar__actions">
      <span className={`status status--${props.status}`} title={props.statusTitle} aria-label="SSE status" />
      <button className={`btn btn--ghost${props.libraryVisible ? ' active' : ''}`} title="Toggle Image Library" onClick={props.onLibrary}>🖼 Library</button>
      <button className={`btn btn--ghost${props.cssVisible ? ' active' : ''}`} title="Toggle CSS panel" onClick={props.onCss}>🎨 CSS</button>
      <div className="settings-wrap">
        <button className={`btn btn--ghost${props.settingsOpen ? ' active' : ''}`} title="Settings" onClick={props.onSettings}>⚙ Settings</button>
        {props.settingsOpen && <div className="settings-dropdown is-open" onClick={(event) => event.stopPropagation()}><div className="settings-dropdown__header">Settings</div><div className="settings-section"><div className="settings-section__title">🖼 Image Library</div>
          <label className="settings-toggle"><input type="checkbox" className="settings-toggle__input" checked={props.noCrop} onChange={props.onNoCrop} /><span className="settings-toggle__slider" /><span className="settings-toggle__label">No-crop mode</span><span className="settings-toggle__hint">Use contain instead of cover</span></label>
          <label className={`settings-toggle settings-toggle--nested${props.noCrop ? ' is-visible' : ''}`}><input type="checkbox" className="settings-toggle__input" checked={props.noWhitespace} disabled={!props.noCrop} onChange={props.onNoWhitespace} /><span className="settings-toggle__slider" /><span className="settings-toggle__label">No white-space</span><span className="settings-toggle__hint">Remove fixed thumbnail height</span></label>
        </div></div>}
      </div>
      <input ref={props.imageInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" style={{ display: 'none' }} multiple />
      <button className="btn btn--primary" disabled={props.exporting} onClick={props.onExport}>{props.exporting ? '⏳ Exporting…' : '⬇ Export PDF'}</button>
    </div>
  </header>;
}
