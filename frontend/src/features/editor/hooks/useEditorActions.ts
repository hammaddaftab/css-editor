import { useCallback, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { updateImageFilename } from '../editorUtils';

export function useEditorActions(markdownViewRef: RefObject<EditorView | null>) {
  const insertImage = useCallback((snippet: string) => {
    const view = markdownViewRef.current;
    if (!view) return;
    const position = view.state.selection.main.head;
    view.dispatch({
      changes: { from: position, insert: snippet },
      selection: { anchor: position + snippet.length },
    });
    view.focus();
  }, [markdownViewRef]);

  const renameImageReference = useCallback(
    (oldFilename: string, newFilename: string, oldPath?: string, newPath?: string) => {
      const view = markdownViewRef.current;
      if (!view) return;
      updateImageFilename(view, oldFilename, newFilename, oldPath, newPath);
    },
    [markdownViewRef],
  );

  return {
    insertImage,
    renameImageReference,
  };
}
