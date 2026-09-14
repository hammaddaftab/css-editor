import { useCallback, useRef, useState } from 'react';
import type { Project, ProjectFile, Conflict, WorkspaceRefs } from '../app-types';
import { setEditorContent } from '../editor.js';

const PROJECT_KEY = 'css_editor_active_project';
const FILE_KEY = 'css_editor_active_file';

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* optional storage */ }
}

export function useWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState(() => stored(PROJECT_KEY, ''));
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filename, setFilename] = useState(() => stored(FILE_KEY, 'document.md'));
  const [markdown, setMarkdown] = useState('');
  const [css, setCss] = useState('');
  const [projectCss, setProjectCss] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const refs: WorkspaceRefs = {
    markdownHost: useRef<HTMLDivElement>(null),
    cssHost: useRef<HTMLDivElement>(null),
    markdownView: useRef(null),
    cssView: useRef(null),
    imageInput: useRef<HTMLInputElement>(null),
    imageLibrary: useRef(null),
  };
  const current = useRef({ project, filename, markdown, css, projectCss, dirty });
  current.current = { project, filename, markdown, css, projectCss, dirty };

  const markDirty = useCallback(() => { setDirty(true); setSaveStatus('Unsaved'); }, []);
  const markClean = useCallback((message = 'Saved') => {
    setDirty(false); setConflict(null); setSaveStatus(message);
    window.setTimeout(() => setSaveStatus((value) => value === message ? '' : value), 3000);
  }, []);

  const effectiveCss = useCallback(() => {
    const value = current.current;
    return value.projectCss ? `${value.projectCss}\n${value.css}` : value.css;
  }, []);

  const postRender = useCallback(async (
    nextMarkdown: string,
    nextCss: string,
    context: { project?: string; filename?: string } = {},
  ) => {
    const value = current.current;
    try {
      await fetch('/api/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: nextMarkdown, css: nextCss,
          project: context.project ?? value.project, filename: context.filename ?? value.filename }),
      });
    } catch (error) { console.error('Render failed:', error); }
  }, []);

  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) return [];
      const data = await response.json(); const next = data.projects || [];
      setProjects(next); return next;
    } catch (error) { console.error('Failed to fetch project list:', error); return []; }
  }, []);

  const refreshFiles = useCallback(async (nextProject = current.current.project): Promise<ProjectFile[]> => {
    if (!nextProject) return [];
    try {
      const response = await fetch(`/api/project/documents?project=${encodeURIComponent(nextProject)}`);
      if (!response.ok) return [];
      const data = await response.json(); const next = data.files || [];
      setFiles(next); return next;
    } catch (error) { console.error('Failed to fetch file list:', error); return []; }
  }, []);

  const loadDocument = useCallback(async (nextProject: string, nextFilename: string) => {
    if (!nextProject) return;
    try {
      const query = `project=${encodeURIComponent(nextProject)}&filename=${encodeURIComponent(nextFilename)}`;
      const response = await fetch(`/api/project/document?${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); const nextMarkdown = data.markdown || ''; const nextCss = data.css || '';
      setProject(nextProject); setFilename(data.filename); setMarkdown(nextMarkdown); setCss(nextCss);
      setProjectCss(data.project_css || ''); remember(PROJECT_KEY, nextProject); remember(FILE_KEY, data.filename);
      setEditorContent(refs.markdownView.current, nextMarkdown);
      setEditorContent(refs.cssView.current, nextCss);
      markClean('Loaded');
      void postRender(nextMarkdown, data.project_css ? `${data.project_css}\n${nextCss}` : nextCss,
        { project: nextProject, filename: data.filename });
    } catch (error) { console.error(`Failed to load ${nextFilename}:`, error); }
  }, [markClean, postRender, refs.cssView, refs.markdownView]);

  const saveDocument = useCallback(async (override?: { filename?: string; markdown?: string; css?: string }) => {
    const value = current.current; const target = { ...value, ...override };
    setSaveStatus('Saving…');
    try {
      const response = await fetch('/api/project/document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: target.project, filename: target.filename,
          markdown: target.markdown, css: target.css }),
      });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.detail || response.status); }
      remember(FILE_KEY, target.filename); markClean('Saved'); await refreshFiles(target.project);
    } catch (error) { setSaveStatus('Save failed'); window.alert(`Save failed: ${(error as Error).message}`); }
  }, [markClean, refreshFiles]);

  const updateMarkdown = useCallback((value: string) => {
    setMarkdown(value); markDirty(); void postRender(value, effectiveCss());
  }, [effectiveCss, markDirty, postRender]);

  const updateCss = useCallback((value: string) => {
    setCss(value); markDirty(); const base = current.current;
    void postRender(base.markdown, base.projectCss ? `${base.projectCss}\n${value}` : value);
  }, [markDirty, postRender]);

  return {
    projects, project, files, filename, markdown, css, projectCss, dirty, saveStatus, conflict,
    setProject, setFilename, setMarkdown, setCss, setProjectCss, setFiles, setDirty, setSaveStatus,
    setConflict, refs, current, effectiveCss, postRender, refreshProjects, refreshFiles, loadDocument,
    saveDocument, updateMarkdown, updateCss, markDirty, markClean, remember,
  };
}
