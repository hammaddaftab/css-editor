import { useCallback, useEffect } from 'react';
import { setEditorContent } from '../editor.js';

export function useProjects(workspace: any) {
  const {
    project, filename, dirty, refs, current, setProject, setFilename,
    refreshProjects, refreshFiles, loadDocument, saveDocument, markDirty, setMarkdown, setCss, remember,
  } = workspace;

  const switchProject = useCallback(async (nextProject: string) => {
    const active = current.current;
    if (active.dirty && !window.confirm(`You have unsaved changes in ${active.filename}. Switch project anyway?`)) return;
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
  }, [current, loadDocument, remember, refreshFiles, refreshProjects, setFilename, setProject]);

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

  useEffect(() => {
    let active = true;
    void (async () => {
      const available = await refreshProjects();
      if (!active) return;

      // If CLI seeded a watch file and we don't have an active user project override:
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
    return () => { active = false; };
  }, [current, loadDocument, refreshFiles, refreshProjects, setFilename, setProject, workspace.activeWatchTarget]);

  return { project, filename, switchProject, switchFile, switchToProjects };
}
