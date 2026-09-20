import { ImageLibrary } from '../../image-library';
import { EditorPanes } from '../../editor';
import { PreviewPane } from '../../preview';
import type { WorkspacePanesProps } from '../types';

export function WorkspacePanes(props: WorkspacePanesProps) {
  const panesClass = `panes${props.previewVisible ? '' : ' preview-collapsed'}`;
  const leftClass = `left-pane${props.libraryVisible ? '' : ' library-collapsed'}${props.cssVisible ? '' : ' css-collapsed'}`;

  const markdownHost = props.markdownHost || props.refs?.markdownHost;
  const cssHost = props.cssHost || props.refs?.cssHost;
  const imageLibraryRef = props.imageLibraryRef || props.refs?.imageLibrary;
  const fileInputRef = props.fileInputRef || props.refs?.imageInput;

  return (
    <div className={panesClass} ref={props.panes}>
      <div className={leftClass} ref={props.leftPane}>
        <ImageLibrary
          ref={imageLibraryRef}
          docPath={props.docPath}
          visible={props.libraryVisible}
          noCrop={props.noCrop}
          noWhitespace={props.noWhitespace}
          fileInputRef={fileInputRef}
          onInsert={props.onInsertImage}
          onRename={props.onRenameImage}
        />
        {markdownHost && cssHost && (
          <EditorPanes
            markdownHost={markdownHost}
            cssHost={cssHost}
            cssVisible={props.cssVisible}
            onCss={props.onCss}
          />
        )}
      </div>
      <div className="pane-divider" ref={props.divider} role="separator" aria-label="Resize panes" />
      <PreviewPane
        frameA={props.frameA}
        frameB={props.frameB}
        activeFrame={props.activeFrame}
        previewScroll={props.previewScroll}
        pageCount={props.pageCount}
        theme={props.theme}
        onTheme={props.onTheme}
      />
    </div>
  );
}
