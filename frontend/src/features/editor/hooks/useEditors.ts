// React hook managing CodeMirror editor lifecycle and synchronizing with workspace state

import { useEffect } from 'react';
import { createCssEditor, createMarkdownEditor } from '../editorEngine';
import type { UseEditorsOptions } from '../types';

export function useEditors(workspace: UseEditorsOptions): void {
  const { refs, updateMarkdown, updateCss, saveDocument } = workspace;

  useEffect(() => {
    if (!refs.markdownHost.current || !refs.cssHost.current) return;

    const markdownView = createMarkdownEditor(refs.markdownHost.current, updateMarkdown, {
      onSave: saveDocument,
      onImageVicinity: (url: string | null) => {
        refs.imageLibrary?.current?.focusImage(url);
      },
      onDropImage: (image: { url: string }) => refs.imageLibrary?.current?.focusImage(image.url),
      onPasteImage: async (file: File) => {
        const uploaded = await refs.imageLibrary?.current?.uploadFiles([file]);
        return uploaded?.[0];
      },
    });
    const cssView = createCssEditor(refs.cssHost.current, updateCss, { onSave: saveDocument });
    refs.markdownView.current = markdownView;
    refs.cssView.current = cssView;

    return () => {
      markdownView.destroy();
      cssView.destroy();
    };
  }, [
    refs.cssHost,
    refs.cssView,
    refs.imageLibrary,
    refs.markdownHost,
    refs.markdownView,
    saveDocument,
    updateCss,
    updateMarkdown,
  ]);
}
