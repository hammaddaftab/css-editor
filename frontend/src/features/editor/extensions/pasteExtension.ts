// CodeMirror extension for uploading pasted clipboard images

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export function makeImagePasteExtension(onPasteImage?: (file: File) => Promise<any>): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.items;
      if (!items) return false;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return false;

      event.preventDefault();

      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      const onBlankLine = line.text.trim().length === 0;
      const placeholder = '![Uploading image…]()';
      const insertText = onBlankLine ? placeholder : `\n\n${placeholder}`;

      view.dispatch({
        changes: { from: head, insert: insertText },
        selection: { anchor: head + insertText.length },
      });

      (async () => {
        for (const file of imageFiles) {
          try {
            const data = await onPasteImage?.(file);
            if (!data) continue;
            const targetPath = data.rel_path || data.url;
            const snippet = `![img](${targetPath})`;

            const docText = view.state.doc.toString();
            const placeholderIdx = docText.indexOf(placeholder);
            if (placeholderIdx !== -1) {
              view.dispatch({
                changes: {
                  from: placeholderIdx,
                  to: placeholderIdx + placeholder.length,
                  insert: snippet,
                },
              });
            }
          } catch (err) {
            console.error('Image paste upload error:', err);
          }
        }
      })();

      return true;
    },
  });
}
