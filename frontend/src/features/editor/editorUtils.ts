// CodeMirror document content manipulation utilities

import type { EditorView } from 'codemirror';
import { programmaticContentUpdate } from './editorEngine';

export function setEditorContent(view: EditorView | null | undefined, text: string): void {
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: programmaticContentUpdate.of(true),
  });
}

export function updateImageFilename(
  view: EditorView | null | undefined,
  oldFilename: string,
  newFilename: string,
  oldPath?: string,
  newPath?: string,
): void {
  if (!view) return;
  const text = view.state.doc.toString();
  // Match Markdown image syntax: ![any alt](target_path)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullPath = match[2].trim();
    const pathNoQuery = fullPath.split('?')[0].split('#')[0];
    const pathFilename = pathNoQuery.split('/').pop();

    if (pathFilename === oldFilename || (oldPath && fullPath.includes(oldPath))) {
      let updatedPath = fullPath;
      if (oldPath && newPath && fullPath === oldPath) {
        updatedPath = newPath;
      } else {
        const lastIdx = fullPath.lastIndexOf(oldFilename);
        if (lastIdx !== -1) {
          updatedPath =
            fullPath.substring(0, lastIdx) +
            newFilename +
            fullPath.substring(lastIdx + oldFilename.length);
        } else if (newPath) {
          updatedPath = newPath;
        }
      }
      const pathStart = match.index + 2 + match[1].length + 2; // after ![alt](
      const pathEnd = pathStart + match[2].length;
      changes.push({ from: pathStart, to: pathEnd, insert: updatedPath });
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
}
