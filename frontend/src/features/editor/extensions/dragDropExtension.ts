// CodeMirror extension for image drag-and-drop and drop target line indicator

import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';

export const setDropTargetLine = StateEffect.define<number>();
export const clearDropTargetLine = StateEffect.define<null>();

export const dropTargetField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDropTargetLine)) {
        const lineNum = effect.value;
        if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
          const line = tr.state.doc.line(lineNum);
          decorations = Decoration.set([
            Decoration.line({ class: 'cm-drop-target-line' }).range(line.from),
          ]);
        }
      } else if (effect.is(clearDropTargetLine)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function makeImageDragDropExtension(onDropImage?: (imgData: any) => void): Extension {
  return EditorView.domEventHandlers({
    dragover(event, view) {
      const isImageCard = event.dataTransfer?.types.includes('application/x-editor-image');
      if (!isImageCard) return false;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          effects: setDropTargetLine.of(line.number),
        });
      }
      return true;
    },

    dragleave(event, view) {
      if (event.relatedTarget && !view.dom.contains(event.relatedTarget as Node)) {
        view.dispatch({ effects: clearDropTargetLine.of(null) });
      }
      return true;
    },

    drop(event, view) {
      view.dispatch({ effects: clearDropTargetLine.of(null) });

      const rawData = event.dataTransfer?.getData('application/x-editor-image');
      if (!rawData) return false;

      event.preventDefault();
      let imgData: any;
      try {
        imgData = JSON.parse(rawData);
      } catch {
        return false;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const insertPos = pos !== null ? pos : view.state.selection.main.head;
      const line = view.state.doc.lineAt(insertPos);
      const targetPath = imgData.rel_path || imgData.url;
      const snippet = `![img](${targetPath})`;

      if (line.text.trim().length === 0) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: snippet },
          selection: { anchor: line.from + snippet.length },
        });
      } else {
        const insertFrom = line.to;
        const textToInsert = `\n\n${snippet}`;
        view.dispatch({
          changes: { from: insertFrom, insert: textToInsert },
          selection: { anchor: insertFrom + textToInsert.length },
        });
      }

      view.focus();
      if (onDropImage) onDropImage(imgData);
      return true;
    },
  });
}
