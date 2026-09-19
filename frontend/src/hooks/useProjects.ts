import { useCallback, useEffect, useRef } from 'react';
import { setEditorContent } from '../editor.js';

export function useProjects(workspace: any) {
  const {
    project, filename, dirty, refs, current, setProject, setFilename,
    refreshProjects, refreshFiles, loadDocument, saveDocument, markDirty, setMarkdown, setCss, remember,
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
    await loadDocument({ mode: 'watch', path: targetPath });
  }, [current, loadDocument]);

  const switchToWatch = useCallback(async () => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes. Switch anyway?`)) return;
    if (workspace.activeWatchTarget?.path) {
      await loadDocument({ mode: 'watch', path: workspace.activeWatchTarget.path });
    }
  }, [current, loadDocument, workspace.activeWatchTarget]);

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
    setProject(nextProject);
    remember('css_editor_active_project', nextProject);
    const nextFiles = await refreshFiles(nextProject);
    const nextFile = nextFiles[0]?.filename || 'README.md';
    setFilename(nextFile);
    await loadDocument({ mode: 'project', project: nextProject, filename: nextFile });
  }, [current, loadDocument, openWatchFile, remember, refreshFiles, refreshProjects, setFilename, setProject]);

  const switchFile = useCallback(async (nextFilename: string) => {
    if (nextFilename === '__new__') {
      const name = window.prompt('New markdown filename (e.g. notes.md or docs/notes.md):')?.trim();
      if (!name) return;
      const cleanName = name.endsWith('.md') ? name : `${name}.md`;
      const nextMarkdown = `# ${cleanName.replace(/\.md$/, '')}\n\n`;
      setFilename(cleanName);
      setMarkdown(nextMarkdown);
      setCss('');
      setEditorContent(refs.markdownView.current, nextMarkdown);
      setEditorContent(refs.cssView.current, '');
      markDirty();
      await saveDocument({ filename: cleanName, markdown: nextMarkdown, css: '' });
      return;
    }
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes in ${active.filename}. Switch anyway?`)) return;
    await loadDocument({ mode: 'project', project: active.project, filename: nextFilename });
  }, [current, loadDocument, markDirty, refs.cssView, refs.markdownView, saveDocument, setFilename]);

  const switchToProjects = useCallback(async () => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes. Switch to project mode anyway?`)) return;
    const available = await refreshProjects();
    if (!available.length) return;
    const nextProject = available.some((item: { name: string }) => item.name === active.project)
      ? active.project : available[0].name;
    setProject(nextProject);
    const nextFiles = await refreshFiles(nextProject);
    const nextFile = nextFiles[0]?.filename || 'README.md';
    setFilename(nextFile);
    await loadDocument({ mode: 'project', project: nextProject, filename: nextFile });
  }, [current, loadDocument, refreshFiles, refreshProjects, setFilename, setProject]);

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      const available = await refreshProjects();

      // If CLI seeded a watch file:
      const activeWatch = workspace.activeWatchTarget;
      if (activeWatch && activeWatch.path) {
        await loadDocument({ mode: 'watch', path: activeWatch.path });
        return;
      }

      if (!available.length) return;
      const nextProject = available.some((item: { name: string }) => item.name === current.current.project)
        ? current.current.project : available[0].name;
      setProject(nextProject);
      const nextFiles = await refreshFiles(nextProject);
      const nextFile = nextFiles.some((item: { filename: string }) => item.filename === current.current.filename)
        ? current.current.filename : nextFiles[0]?.filename;
      if (nextFile) {
        setFilename(nextFile);
        await loadDocument({ mode: 'project', project: nextProject, filename: nextFile });
      }
    })();
  }, [current, loadDocument, refreshFiles, refreshProjects, setFilename, setProject, workspace.activeWatchTarget]);

  return { project, filename, switchProject, switchFile, switchToProjects, openWatchFile, switchToWatch };
}
