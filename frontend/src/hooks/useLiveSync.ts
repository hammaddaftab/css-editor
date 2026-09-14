import { useEffect, type RefObject } from 'react';
import { setEditorContent } from '../editor.js';
import { connectSSE } from '../sse-client.js';
import { updatePreview } from '../preview.js';

export function useLiveSync(workspace: any, frame: RefObject<HTMLIFrameElement | null>, theme: string, setStatus: any, setPageCount: any): void {
  const { current, refs, setProjectCss, setMarkdown, setCss, setFiles, setDirty, setSaveStatus,
    setConflict, markClean, effectiveCss, postRender, refreshFiles } = workspace;

  useEffect(() => {
    const connection = connectSSE(window);
    const onConnected = () => { setStatus('connected', 'Live'); void postRender(current.current.markdown, effectiveCss()); };
    const onRender = (event: Event) => {
      const data = (event as CustomEvent).detail || {}; const active = current.current;
      if ((data.project && data.project !== active.project) || (data.filename && data.filename !== active.filename)) return;
      if (data.project_css !== undefined) setProjectCss(data.project_css);
      const renderedCss = data.project_css !== undefined ? `${data.project_css}\n${data.css || ''}` : data.css || effectiveCss();
      updatePreview(frame.current, data.html || '', renderedCss, theme); setStatus('connected', 'Live');
      window.setTimeout(() => {
        const pages = frame.current?.contentDocument?.querySelectorAll('.pagedjs_page').length || 0;
        setPageCount(pages ? `${pages} page${pages > 1 ? 's' : ''}` : '');
      }, 800);
    };
    const onFileChange = (event: Event) => {
      const data = (event as CustomEvent).detail || {}; const active = current.current;
      if (!data.filename || (data.project && data.project !== active.project)) return;
      if (data.action === 'deleted') {
        if (data.filename === active.filename) { setDirty(true); setSaveStatus('Deleted on disk'); }
        void refreshFiles(active.project); return;
      }
      if (data.action === 'added' || data.filename !== active.filename) {
        void refreshFiles(active.project); if (data.filename !== active.filename) return;
      }
      if (data.filename === 'project.css') {
        if (data.project_css !== undefined && active.dirty) setConflict(data);
        else if (data.project_css !== undefined) {
          setProjectCss(data.project_css); void postRender(active.markdown, data.project_css ? `${data.project_css}\n${active.css}` : active.css); markClean('Synced from disk');
        }
        return;
      }
      const mdChanged = data.markdown !== undefined && data.markdown !== active.markdown;
      const cssChanged = data.css !== undefined && data.css !== active.css;
      const projectChanged = data.project_css !== undefined && data.project_css !== active.projectCss;
      if (!mdChanged && !cssChanged && !projectChanged) return;
      if (active.dirty) { setConflict(data); return; }
      if (mdChanged) { setMarkdown(data.markdown); setEditorContent(refs.markdownView.current, data.markdown); }
      if (cssChanged) { setCss(data.css); setEditorContent(refs.cssView.current, data.css); }
      if (projectChanged) setProjectCss(data.project_css);
      if (data.html) updatePreview(frame.current, data.html, data.project_css ? `${data.project_css}\n${data.css || ''}` : data.css || active.css, theme);
      markClean('Synced from disk');
    };
    const onFileList = (event: Event) => {
      const files = (event as CustomEvent).detail?.files;
      if (Array.isArray(files)) setFiles(files); else void refreshFiles(current.current.project);
    };
    const onError = (event: Event) => setStatus('error', (event as CustomEvent).detail?.message || 'Connection error');
    const onOffline = () => setStatus('idle', 'Reconnecting…');
    window.addEventListener('sse:connected', onConnected); window.addEventListener('sse:render', onRender);
    window.addEventListener('sse:file:change', onFileChange); window.addEventListener('sse:file:list', onFileList);
    window.addEventListener('sse:error', onError); window.addEventListener('sse:offline', onOffline);
    return () => {
      connection.close(); window.removeEventListener('sse:connected', onConnected); window.removeEventListener('sse:render', onRender);
      window.removeEventListener('sse:file:change', onFileChange); window.removeEventListener('sse:file:list', onFileList);
      window.removeEventListener('sse:error', onError); window.removeEventListener('sse:offline', onOffline);
    };
  }, [current, effectiveCss, frame, markClean, postRender, refreshFiles, refs.cssView, refs.markdownView,
    setConflict, setCss, setDirty, setFiles, setMarkdown, setProjectCss, setSaveStatus, setStatus, theme]);
}
