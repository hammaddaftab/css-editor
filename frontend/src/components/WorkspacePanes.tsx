import type { RefObject } from 'react';
import type { LibraryRefs, WorkspaceRefs } from '../app-types';

type Props = {
  refs: WorkspaceRefs;
  library: LibraryRefs;
  panes: RefObject<HTMLDivElement | null>;
  divider: RefObject<HTMLDivElement | null>;
  leftPane: RefObject<HTMLDivElement | null>;
  libraryVisible: boolean;
  cssVisible: boolean;
  noCrop: boolean;
  noWhitespace: boolean;
  frame: RefObject<HTMLIFrameElement | null>;
  pageCount: string;
  theme: string;
  onCss: () => void;
  onTheme: (theme: string) => void;
};

export function WorkspacePanes(props: Props) {
  const leftClass = `left-pane${props.libraryVisible ? '' : ' library-collapsed'}${props.cssVisible ? '' : ' css-collapsed'}`;
  const libraryClass = `image-library${props.noCrop ? ' nocrop-mode' : ''}${props.noWhitespace ? ' nowhitespace-mode' : ''}`;
  return <div className="panes" ref={props.panes}>
    <div className={leftClass} ref={props.leftPane}>
      <aside className={libraryClass} ref={props.library.container}><div className="image-library__header"><div className="image-library__title"><span className="image-library__icon">🖼</span><span>Library</span><span className="image-library__count" ref={props.library.count}>0</span></div><button ref={props.library.uploadButton} id="upload-library-btn" className="btn btn--ghost btn--xs" title="Upload images">＋ Upload</button></div><div className="image-library__dropzone" ref={props.library.dropzone}><span className="dropzone-text">📥 Drop images here</span></div><div className="image-library__list" ref={props.library.list} /></aside>
      <div className="editors-col"><div className="editor-section"><div className="section-header"><span>Markdown</span></div><div className="cm-host" ref={props.refs.markdownHost} /></div><div className="editor-section"><div className="section-header"><span>Custom CSS</span><button className="section-header__toggle" title={props.cssVisible ? 'Collapse CSS panel' : 'Expand CSS panel'} aria-expanded={props.cssVisible} onClick={props.onCss}>▼</button></div><div className="cm-host" ref={props.refs.cssHost} /></div></div>
    </div>
    <div className="pane-divider" ref={props.divider} role="separator" aria-label="Resize panes" />
    <div className="right-pane"><div className="preview-toolbar"><div className="preview-toolbar__left"><span>A4 Preview · paged.js</span><span className="preview-toolbar__meta">{props.pageCount}</span></div><div className="preview-toolbar__right"><div className="preview-theme-toggle" role="group" aria-label="Preview background theme"><button type="button" className={`preview-theme-btn${props.theme === 'light' ? ' active' : ''}`} onClick={() => props.onTheme('light')}>☀️ Light</button><button type="button" className={`preview-theme-btn${props.theme === 'dark' ? ' active' : ''}`} onClick={() => props.onTheme('dark')}>🌙 Dark</button></div></div></div><div className={`preview-scroll preview-theme--${props.theme}`}><iframe ref={props.frame} className="preview-frame" sandbox="allow-scripts allow-same-origin" title="Document preview" /></div></div>
  </div>;
}
