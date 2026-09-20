// Dual editor pane container for Markdown and Custom CSS CodeMirror instances

import type { RefObject } from 'react';

export interface EditorPanesProps {
  markdownHost: RefObject<HTMLDivElement | null>;
  cssHost: RefObject<HTMLDivElement | null>;
  cssVisible: boolean;
  onCss: () => void;
}

export function EditorPanes({
  markdownHost,
  cssHost,
  cssVisible,
  onCss,
}: EditorPanesProps) {
  return (
    <div className="editors-col">
      <div className="editor-section">
        <div className="section-header">
          <span>Markdown</span>
        </div>
        <div className="cm-host" ref={markdownHost} />
      </div>
      <div className="editor-section">
        <div className="section-header">
          <span>Custom CSS</span>
          <button
            className="section-header__toggle"
            title={cssVisible ? 'Collapse CSS panel' : 'Expand CSS panel'}
            aria-expanded={cssVisible}
            onClick={onCss}
          >
            {cssVisible ? '▾' : '▸'}
          </button>
        </div>
        <div className="cm-host" ref={cssHost} />
      </div>
    </div>
  );
}
