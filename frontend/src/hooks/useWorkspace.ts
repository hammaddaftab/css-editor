import { useCallback, useRef, useState } from 'react';
import type { Project, ProjectFile, Conflict, WorkspaceRefs, TargetSpec, WorkspaceProject } from '../app-types';
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
  const [workspaceProjects, setWorkspaceProjects] = useState<WorkspaceProject[]>([]);
  const [project, setProject] = useState(() => stored(PROJECT_KEY, ''));
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filename, setFilename] = useState(() => stored(FILE_KEY, 'document.md'));
  const [target, setTarget] = useState<TargetSpec>(() => ({
    mode: 'project',
    project: stored(PROJECT_KEY, ''),
    filename: stored(FILE_KEY, 'document.md'),
  }));
  const [activeWatchTarget, setActiveWatchTarget] = useState<{ path: string; filename: string } | null>(null);
  const [docToken, setDocToken] = useState('');
  const [docPath, setDocPath] = useState('');
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

  const current = useRef({
    project,
    filename,
    markdown,
    css,
    projectCss,
    dirty,
    target,
    docToken,
    docPath,
  });
  current.current = {
    project,
    filename,
    markdown,
    css,
    projectCss,
    dirty,
    target,
    docToken,
    docPath,
  };

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
    context: { project?: string; filename?: string; docPath?: string; docToken?: string } = {},
  ) => {
    const value = current.current;
    try {
      await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: nextMarkdown,
          css: nextCss,
          project: context.project ?? value.project,
          filename: context.filename ?? value.filename,
          doc_path: context.docPath ?? value.docPath,
          doc_token: context.docToken ?? value.docToken,
        }),
      });
    } catch (error) { console.error('Render failed:', error); }
  }, []);

  const refreshProjects = useCallback(async (): Promise<WorkspaceProject[]> => {
    try {
      const response = await fetch('/api/workspace');
      if (!response.ok) return [];
      const data = await response.json();
      if (data.active_watch_target) {
        setActiveWatchTarget(data.active_watch_target);
      }
      const nextProjects: WorkspaceProject[] = data.projects || [];
      setWorkspaceProjects(nextProjects);
      setProjects(nextProjects.map((p) => ({ name: p.name, documents: p.documents.length })));
      return nextProjects;
    } catch (error) { console.error('Failed to fetch project list:', error); return []; }
  }, []);

  const refreshFiles = useCallback(async (nextProject = current.current.project): Promise<ProjectFile[]> => {
    if (!nextProject) return [];
    try {
      const response = await fetch('/api/workspace');
      if (!response.ok) return [];
      const data = await response.json();
      const proj = (data.projects || []).find((p: WorkspaceProject) => p.name === nextProject);
      const nextFiles = proj ? proj.documents : [];
      setFiles(nextFiles);
      return nextFiles;
    } catch (error) { console.error('Failed to fetch file list:', error); return []; }
  }, []);

  const loadDocument = useCallback(async (targetOrProject: TargetSpec | string, maybeFilename?: string) => {
    let spec: TargetSpec;
    if (typeof targetOrProject === 'string') {
      spec = { mode: 'project', project: targetOrProject, filename: maybeFilename || 'README.md' };
    } else {
      spec = targetOrProject;
    }

    try {
      let query = `mode=${spec.mode}`;
      if (spec.mode === 'watch') {
        query += `&path=${encodeURIComponent(spec.path)}`;
        if (spec.customCss) query += `&custom_css=${encodeURIComponent(spec.customCss)}`;
      } else {
        query += `&project=${encodeURIComponent(spec.project)}&filename=${encodeURIComponent(spec.filename)}`;
      }

      const response = await fetch(`/api/document?${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const nextMarkdown = data.markdown || '';
      const nextCss = data.css || '';
      const sharedCss = data.shared_css || '';

      setTarget(spec);
      setDocToken(data.doc_token || '');
      setDocPath(data.doc_path || '');
      setMarkdown(nextMarkdown);
      setCss(nextCss);
      setProjectCss(sharedCss);

      if (spec.mode === 'project') {
        setProject(spec.project);
        setFilename(data.filename);
        remember(PROJECT_KEY, spec.project);
        remember(FILE_KEY, data.filename);
      } else {
        setFilename(data.filename);
      }

      setEditorContent(refs.markdownView.current, nextMarkdown);
      setEditorContent(refs.cssView.current, nextCss);
      await refs.imageLibrary.current?.setDoc(data.doc_path);
      markClean('Loaded');

      const renderedCss = sharedCss ? `${sharedCss}\n${nextCss}` : nextCss;
      void postRender(nextMarkdown, renderedCss, {
        project: spec.mode === 'project' ? spec.project : '',
        filename: data.filename,
        docPath: data.doc_path,
        docToken: data.doc_token,
      });
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  }, [markClean, postRender, refs.cssView, refs.imageLibrary, refs.markdownView]);

  const saveDocument = useCallback(async (override?: { filename?: string; markdown?: string; css?: string }) => {
    const value = current.current;
    const activeTarget = value.target;
    const mdToSave = override?.markdown ?? value.markdown;
    const cssToSave = override?.css ?? value.css;

    setSaveStatus('Saving…');
    try {
      const payload: Record<string, any> = {
        mode: activeTarget.mode,
        markdown: mdToSave,
        css: cssToSave,
      };

      if (activeTarget.mode === 'watch') {
        payload.path = activeTarget.path;
        payload.custom_css = activeTarget.customCss;
      } else {
        payload.project = activeTarget.project;
        payload.filename = override?.filename ?? activeTarget.filename;
      }

      const response = await fetch('/api/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || response.status);
      }
      markClean('Saved');
      if (activeTarget.mode === 'project') {
        remember(FILE_KEY, payload.filename);
        await refreshFiles(activeTarget.project);
      }
    } catch (error) {
      setSaveStatus('Save failed');
      window.alert(`Save failed: ${(error as Error).message}`);
    }
  }, [markClean, refreshFiles]);

  const updateMarkdown = useCallback((value: string) => {
    setMarkdown(value); markDirty(); void postRender(value, effectiveCss());
  }, [effectiveCss, markDirty, postRender]);

  const updateCss = useCallback((value: string) => {
    setCss(value); markDirty(); const base = current.current;
    void postRender(base.markdown, base.projectCss ? `${base.projectCss}\n${value}` : value);
  }, [markDirty, postRender]);

  return {
    projects, workspaceProjects, project, files, filename, target, docToken, docPath,
    activeWatchTarget,
    markdown, css, projectCss, dirty, saveStatus, conflict,
    setTarget, setDocToken, setDocPath, setProject, setFilename, setMarkdown, setCss,
    setProjectCss, setFiles, setDirty, setSaveStatus, setConflict,
    refs, current, effectiveCss, postRender, refreshProjects, refreshFiles,
    loadDocument, saveDocument, updateMarkdown, updateCss, markDirty, markClean, remember,
  };
}
