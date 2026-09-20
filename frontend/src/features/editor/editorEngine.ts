// CodeMirror 6 editor engine factory and configuration

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';

import type { MarkdownEditorOptions, CssEditorOptions } from './types';
import { DEFAULT_MARKDOWN, DEFAULT_CSS } from './editorDefaults';
import {
  dropTargetField,
  makeImageDragDropExtension,
} from './extensions/dragDropExtension';
import { makeImagePasteExtension } from './extensions/pasteExtension';
import { makeImageVicinityExtension } from './extensions/vicinityExtension';

export const programmaticContentUpdate = Annotation.define<boolean>();

const DEBOUNCE_MS = 400;

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

interface MakeEditorParams {
  container: HTMLElement;
  doc: string;
  lang: Extension;
  onChange: (text: string) => void;
  onSave?: () => void;
  extraExtensions?: Extension[];
}

function makeEditor({
  container,
  doc,
  lang,
  onChange,
  onSave,
  extraExtensions = [],
}: MakeEditorParams): EditorView {
  const onChangeFn = debounce(onChange, DEBOUNCE_MS);

  const extensions: Extension[] = [
    basicSetup,
    lang,
    oneDark,
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
    }),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      const isProgrammatic = update.transactions.some((transaction) =>
        transaction.annotation(programmaticContentUpdate)
      );
      if (update.docChanged && !isProgrammatic) {
        onChangeFn(update.state.doc.toString());
      }
    }),
    ...extraExtensions,
  ];

  if (onSave) {
    extensions.push(
      keymap.of([
        {
          key: 'Mod-s',
          run() {
            onSave();
            return true;
          },
        },
      ])
    );
  }

  return new EditorView({
    state: EditorState.create({
      doc,
      extensions,
    }),
    parent: container,
  });
}

export function createMarkdownEditor(
  container: HTMLElement,
  onChange: (text: string) => void,
  {
    doc = DEFAULT_MARKDOWN,
    onImageVicinity,
    onDropImage,
    onPasteImage,
    onSave,
  }: MarkdownEditorOptions = {}
): EditorView {
  const extraExtensions: Extension[] = [
    dropTargetField,
    makeImageDragDropExtension(onDropImage),
    makeImagePasteExtension(onPasteImage),
  ];

  if (onImageVicinity) {
    extraExtensions.push(...makeImageVicinityExtension(onImageVicinity));
  }

  return makeEditor({
    container,
    doc,
    lang: markdown(),
    onChange,
    onSave,
    extraExtensions,
  });
}

export function createCssEditor(
  container: HTMLElement,
  onChange: (text: string) => void,
  { doc = DEFAULT_CSS, onSave }: CssEditorOptions = {}
): EditorView {
  return makeEditor({ container, doc, lang: css(), onChange, onSave });
}
