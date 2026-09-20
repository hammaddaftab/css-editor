// CodeMirror extension to focus an image only when caret or mouse cursor lies inside the () part of ![alt](url)

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const IMG_MARKDOWN_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function findImageInParen(lineText: string, offset: number): string | null {
  IMG_MARKDOWN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = IMG_MARKDOWN_REGEX.exec(lineText)) !== null) {
    const fullMatch = match[0];
    const openParenIdx = fullMatch.indexOf('(');
    const closeParenIdx = fullMatch.lastIndexOf(')');

    if (openParenIdx === -1 || closeParenIdx === -1) continue;

    const openParen = match.index + openParenIdx;
    const closeParen = match.index + closeParenIdx;

    // Focus only when the cursor lies inside or on the () part of the []() syntax
    if (offset >= openParen && offset <= closeParen) {
      const rawTarget = match[2].trim();
      return rawTarget.split(/\s+/)[0];
    }
  }

  return null;
}

export function makeImageVicinityExtension(onFocusImage: (url: string | null) => void): Extension[] {
  let lastFocusedUrl: string | null = null;

  function notifyFocus(url: string | null): void {
    if (url !== lastFocusedUrl) {
      lastFocusedUrl = url;
      onFocusImage(url);
    }
  }

  const selectionListener = EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const head = update.state.selection.main.head;
    const doc = update.state.doc;
    const line = doc.lineAt(head);
    const offset = head - line.from;

    const matchedUrl = findImageInParen(line.text, offset);
    notifyFocus(matchedUrl);
  });

  const mouseHandler = EditorView.domEventHandlers({
    mousemove(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) {
        notifyFocus(null);
        return;
      }
      const line = view.state.doc.lineAt(pos);
      const offset = pos - line.from;
      const url = findImageInParen(line.text, offset);
      notifyFocus(url);
    },
    mouseleave() {
      notifyFocus(null);
    },
  });

  return [selectionListener, mouseHandler];
}
