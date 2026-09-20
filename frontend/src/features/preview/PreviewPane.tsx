import type { PreviewPaneProps } from './types';

export function PreviewPane({
  frameA,
  frameB,
  activeFrame,
  previewScroll,
  pageCount,
  theme,
  onTheme,
}: PreviewPaneProps) {
  return (
    <div className="right-pane">
      <div className="preview-toolbar">
        <div className="preview-toolbar__left">
          <span>Paged.js Preview</span>
          <span className="preview-toolbar__meta">{pageCount}</span>
        </div>
        <div className="preview-toolbar__right">
          <div className="preview-theme-toggle" role="group" aria-label="Preview background theme">
            <button
              type="button"
              className={`preview-theme-btn${theme === 'light' ? ' active' : ''}`}
              onClick={() => onTheme('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`preview-theme-btn${theme === 'dark' ? ' active' : ''}`}
              onClick={() => onTheme('dark')}
            >
              Dark
            </button>
          </div>
        </div>
      </div>
      <div className={`preview-scroll preview-theme--${theme}`} ref={previewScroll}>
        <iframe
          ref={frameA}
          className={`preview-frame ${activeFrame === 'A' ? 'preview-frame--visible' : 'preview-frame--staging'}`}
          title="Document preview"
        />
        <iframe
          ref={frameB}
          className={`preview-frame ${activeFrame === 'B' ? 'preview-frame--visible' : 'preview-frame--staging'}`}
          title="Document preview staging"
        />
      </div>
    </div>
  );
}
