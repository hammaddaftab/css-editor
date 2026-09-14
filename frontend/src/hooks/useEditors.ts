import { useEffect } from 'react';
import { createCssEditor, createMarkdownEditor } from '../editor.js';
import { initImageLibrary } from '../image-library.js';
import type { LibraryRefs } from '../app-types';

const markdownEditor = createMarkdownEditor as any;
const cssEditor = createCssEditor as any;

function updateImageAlt(view: any, url: string, name: string): void {
  if (!view) return;
  const text = view.state.doc.toString();
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, 'g');
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    changes.push({ from: match.index + 2, to: match.index + 2 + match[1].length, insert: name });
  }
  if (changes.length) view.dispatch({ changes });
}

export function useEditors(workspace: any, library: LibraryRefs): void {
  const { refs, updateMarkdown, updateCss, saveDocument } = workspace;

  useEffect(() => {
    const markdownView = markdownEditor(refs.markdownHost.current, updateMarkdown, {
      onSave: saveDocument,
      onImageVicinity: (url: string) => refs.imageLibrary.current?.focusImage(url),
      onDropImage: (image: { url: string }) => refs.imageLibrary.current?.focusImage(image.url),
      onPasteImage: async (file: File) => {
        const uploaded = await refs.imageLibrary.current?.uploadFiles([file], workspace.current.current.project);
        return uploaded?.[0];
      },
    });
    const cssView = cssEditor(refs.cssHost.current, updateCss, { onSave: saveDocument });
    refs.markdownView.current = markdownView;
    refs.cssView.current = cssView;

    refs.imageLibrary.current = initImageLibrary({
      container: library.container.current, listEl: library.list.current,
      dropzoneEl: library.dropzone.current, fileInputEl: refs.imageInput.current,
      countEl: library.count.current, uploadBtnEl: library.uploadButton.current,
      project: workspace.current.current.project,
      onInsert: (snippet: string) => {
        const position = markdownView.state.selection.main.head;
        markdownView.dispatch({ changes: { from: position, insert: snippet },
          selection: { anchor: position + snippet.length } });
        markdownView.focus();
      },
      onNameChange: (image: { url: string }, name: string) => updateImageAlt(markdownView, image.url, name),
    });

    return () => { markdownView.destroy(); cssView.destroy(); };
  }, [library.container, library.count, library.dropzone, library.list, library.uploadButton,
    refs.cssHost, refs.cssView, refs.imageInput, refs.imageLibrary, refs.markdownHost,
    refs.markdownView, saveDocument, updateCss, updateMarkdown, workspace.current]);
}
