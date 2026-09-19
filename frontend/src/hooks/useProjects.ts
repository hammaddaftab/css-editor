import { useCallback, useEffect } from 'react';
import { setEditorContent } from '../editor.js';

export function useProjects(workspace: any) {
  const {
    project, filename, dirty, refs, current,
    refreshProjects, refreshFiles, loadDocument, saveDocument, markDirty, setMarkdown, setCss,
    urlTarget, session, target,
  } = workspace;

  const openWatchFile = useCallback(async (initialPath?: string) => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes in ${active.filename}. Open another file anyway?`)) return;

    let targetPath: string | null = null;
    try {
      const res = await fetch('/api/system/browse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_path: initialPath || active.docPath || '' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          targetPath = data.path;
        } else if (data.cancelled && data.reason && !data.reason.includes('cancelled')) {
          targetPath = window.prompt('Enter path to Markdown file to watch (e.g. /home/user/notes.md):')?.trim() || null;
        }
      }
    } catch {
      targetPath = window.prompt('Enter path to Markdown file to watch (e.g. /home/user/notes.md):')?.trim() || null;
    }

    if (!targetPath) return;
    urlTarget.initWatch(targetPath);
  }, [current, urlTarget]);

  const switchToWatch = useCallback(async () => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes. Switch anyway?`)) return;
    if (session.watch && session.project) {
      urlTarget.switchToWatch();
    } else if (workspace.activeWatchTarget?.path) {
      urlTarget.initWatch(workspace.activeWatchTarget.path);
    }
  }, [current, session, urlTarget, workspace.activeWatchTarget]);

  const switchProject = useCallback(async (nextProject: string) => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes in ${active.filename}. Switch project anyway?`)) return;
    if (nextProject === '__watch__') {
      await openWatchFile();
      return;
    }
    if (nextProject === '__new__') {
      const name = window.prompt('New project directory name (e.g. dsa-2):')?.trim();
      if (!name) return;
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        window.alert(`Project creation failed: ${error.detail || response.status}`);
        return;
      }
      await refreshProjects();
      nextProject = name;
    }
    const nextFiles = await refreshFiles(nextProject);
    const nextFile = nextFiles[0]?.filename || 'README.md';
    if (session.watch) {
      urlTarget.switchProject(nextProject, nextFile);
    } else {
      urlTarget.initProject(nextProject, nextFile);
    }
  }, [current, openWatchFile, refreshFiles, refreshProjects, session, urlTarget]);

  const switchFile = useCallback(async (nextFilename: string) => {
    if (nextFilename === '__new__') {
      const name = window.prompt('New markdown filename (e.g. notes.md or docs/notes.md):')?.trim();
      if (!name) return;
      const cleanName = name.endsWith('.md') ? name : `${name}.md`;
      const nextMarkdown = `# ${cleanName.replace(/\.md$/, '')}\n\n`;
      setMarkdown(nextMarkdown);
      setCss('');
      setEditorContent(refs.markdownView.current, nextMarkdown);
      setEditorContent(refs.cssView.current, '');
      markDirty();
      await saveDocument({ filename: cleanName, markdown: nextMarkdown, css: '' });
      urlTarget.switchFile(cleanName);
      return;
    }
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes in ${active.filename}. Switch anyway?`)) return;
    urlTarget.switchFile(nextFilename);
  }, [current, markDirty, refs.cssView, refs.markdownView, saveDocument, setCss, setMarkdown, urlTarget]);

  const switchToProjects = useCallback(async () => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes. Switch to project mode anyway?`)) return;
    if (session.watch && session.project) {
      urlTarget.switchToProject();
      return;
    }
    const available = await refreshProjects();
    if (!available.length) return;
    const nextProject = available.some((item: { name: string }) => item.name === active.project)
      ? active.project : available[0].name;
    const nextFiles = await refreshFiles(nextProject);
    const nextFile = nextFiles[0]?.filename || 'README.md';
    urlTarget.initProject(nextProject, nextFile);
  }, [current, refreshFiles, refreshProjects, session, urlTarget]);

  const switchToIdle = useCallback(() => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes. Return to launcher anyway?`)) return;
    urlTarget.switchToIdle();
  }, [current, urlTarget]);

  // Initial load: fetch project metadata
  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // Reactive document loading whenever target changes
  useEffect(() => {
    void (async () => {
      if (target.mode === 'idle') {
        await loadDocument({ mode: 'idle' });
        return;
      }
      if (target.mode === 'project') {
        await refreshFiles(target.project);
      }
      await loadDocument(target);
    })();
  }, [loadDocument, refreshFiles, target]);

  return { project, filename, switchProject, switchFile, switchToProjects, openWatchFile, switchToWatch, switchToIdle };
}
