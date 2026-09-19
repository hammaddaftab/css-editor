import { useEffect, type RefObject } from 'react';
import { setEditorContent } from '../editor.js';
import { connectSSE } from '../sse-client.js';
import { updatePreview } from '../preview.js';

export function useLiveSync(
  workspace: any,
  frame: RefObject<HTMLIFrameElement | null>,
  theme: string,
  setStatus: (status: any, title?: string) => void,
  setPageCount: (count: string) => void,
): void {
  const {
    current, refs, setProjectCss, setMarkdown, setCss, setFiles, setDirty, setSaveStatus,
    setConflict, markClean, effectiveCss, postRender, refreshFiles,
  } = workspace;

  useEffect(() => {
    const connection = connectSSE(window);

    const onConnected = () => {
      setStatus('connected', 'Live');
      void postRender(current.current.markdown, effectiveCss());
    };

    const onRender = (event: Event) => {
      const data = (event as CustomEvent).detail || {};
      const active = current.current;

      // Filter by doc_path if present, otherwise by project/filename
      if (active.docPath && data.doc_path && active.docPath !== data.doc_path) return;
      if (active.target.mode === 'project') {
        if ((data.project && data.project !== active.project) || (data.filename && data.filename !== active.filename)) {
          return;
        }
      }

      if (data.project_css !== undefined) setProjectCss(data.project_css);
      const renderedCss = data.project_css !== undefined
        ? `${data.project_css}\n${data.css || ''}`
        : data.css || effectiveCss();
      const token = data.doc_token || active.docToken;

      updatePreview(frame.current, data.html || '', renderedCss, theme, token);
      setStatus('connected', 'Live');

      window.setTimeout(() => {
        const pages = frame.current?.contentDocument?.querySelectorAll('.pagedjs_page').length || 0;
        setPageCount(pages ? `${pages} page${pages > 1 ? 's' : ''}` : '');
      }, 800);
    };

    const onDocumentChange = (event: Event) => {
      const data = (event as CustomEvent).detail || {};
      const active = current.current;

      // Ensure event is for the currently viewed document
      const isSameDoc = (active.docPath && data.doc_path && active.docPath === data.doc_path) ||
        (active.target.mode === 'project' && data.mode === 'project' &&
         data.project === active.project && data.filename === active.filename);

      if (!isSameDoc) return;

      if (data.action === 'deleted') {
        setDirty(true);
        setSaveStatus('Deleted on disk');
        return;
      }

      const mdChanged = data.markdown !== undefined && data.markdown !== active.markdown;
      const cssChanged = data.css !== undefined && data.css !== active.css;
      const sharedChanged = data.shared_css !== undefined && data.shared_css !== active.projectCss;

      if (!mdChanged && !cssChanged && !sharedChanged) return;

      if (active.dirty) {
        setConflict({
          filename: data.filename || active.filename,
          markdown: data.markdown,
          css: data.css,
          project_css: data.shared_css,
          html: data.html,
        });
        return;
      }

      if (data.filename === 'project.css') {
        if (data.shared_css !== undefined && active.dirty) {
          setConflict(data);
        } else if (data.shared_css !== undefined) {
          setProjectCss(data.shared_css);
          void postRender(active.markdown, data.shared_css ? `${data.shared_css}\n${active.css}` : active.css);
          markClean('Synced from disk');
        }
        return;
      }

      // If document in active project changed/deleted, refresh file list
      if (active.target.mode === 'project' && data.mode === 'project' && data.project === active.project) {
        void refreshFiles(active.project);
      }

      if (mdChanged) {
        setMarkdown(data.markdown);
        setEditorContent(refs.markdownView.current, data.markdown);
      }
      if (cssChanged) {
        setCss(data.css);
        setEditorContent(refs.cssView.current, data.css);
      }
      if (sharedChanged) {
        setProjectCss(data.shared_css || '');
      }

      const renderedCss = data.shared_css
        ? `${data.shared_css}\n${data.css || ''}`
        : data.css || active.css;
      const token = data.doc_token || active.docToken;

      if (data.html) {
        updatePreview(frame.current, data.html, renderedCss, theme, token);
      }
      markClean('Synced from disk');
    };

    const onFileList = (event: Event) => {
      const files = (event as CustomEvent).detail?.files;
      if (Array.isArray(files)) setFiles(files);
      else void refreshFiles(current.current.project);
    };

    const onError = (event: Event) => setStatus('error', (event as CustomEvent).detail?.message || 'Connection error');
    const onOffline = () => setStatus('idle', 'Reconnecting…');

    window.addEventListener('sse:connected', onConnected);
    window.addEventListener('sse:render', onRender);
    window.addEventListener('sse:document:change', onDocumentChange);
    window.addEventListener('sse:file:list', onFileList);
    window.addEventListener('sse:error', onError);
    window.addEventListener('sse:offline', onOffline);

    return () => {
      connection.close();
      window.removeEventListener('sse:connected', onConnected);
      window.removeEventListener('sse:render', onRender);
      window.removeEventListener('sse:document:change', onDocumentChange);
      window.removeEventListener('sse:file:list', onFileList);
      window.removeEventListener('sse:error', onError);
      window.removeEventListener('sse:offline', onOffline);
    };
  }, [
    current, effectiveCss, frame, markClean, postRender, refreshFiles,
    refs.cssView, refs.markdownView, setConflict, setCss, setDirty, setFiles,
    setMarkdown, setProjectCss, setSaveStatus, setStatus, theme,
  ]);
}
