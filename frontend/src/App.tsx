import { useCallback, useEffect, useRef, useState } from 'react';
import { posthog } from './analytics';
import { setEditorContent } from './editor.js';
import { updatePreview } from './preview.js';
import { ConflictBanner } from './components/ConflictBanner';
import { IdleLauncher } from './components/IdleLauncher';
import { SettingsSideWindow } from './components/SettingsSideWindow';
import { Toolbar } from './components/Toolbar';
import { WelcomeModal } from './components/WelcomeModal';
import { WorkspacePanes } from './components/WorkspacePanes';
import { useConfig } from './hooks/useConfig';
import { useEditors } from './hooks/useEditors';
import { useLayout } from './hooks/useLayout';
import { useLiveSync } from './hooks/useLiveSync';
import { usePreferences } from './hooks/usePreferences';
import { usePreview } from './hooks/usePreview';
import { useProjects } from './hooks/useProjects';
import { useWorkspace } from './hooks/useWorkspace';
import type { AppStatus } from './app-types';

export default function App() {
  const workspace = useWorkspace();
  const frame = useRef<HTMLIFrameElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const leftPane = useRef<HTMLDivElement>(null);
  const library = {
    container: useRef<HTMLElement>(null), list: useRef<HTMLElement>(null),
    dropzone: useRef<HTMLElement>(null), count: useRef<HTMLElement>(null),
    uploadButton: useRef<HTMLButtonElement>(null),
  };
  const [status, setStatus] = useState<AppStatus>('idle');
  const [statusTitle, setStatusTitle] = useState('Connecting…');
  const [pageCount, setPageCount] = useState('');
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [cssVisible, setCssVisible] = useState(true);
  const [exporting, setExporting] = useState(false);
  const preferences = usePreferences(frame);
  const { switchProject, switchFile, switchToProjects, openWatchFile, switchToWatch, switchToIdle } = useProjects(workspace);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openWatchFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openWatchFile]);

  const onDirectoryChanged = useCallback(async () => {
    const available = await workspace.refreshProjects();
    if (available.length && workspace.target.mode !== 'idle') {
      const nextProject = available[0].name;
      workspace.setProject(nextProject);
      const nextFiles = await workspace.refreshFiles(nextProject);
      const nextFile = nextFiles[0]?.filename || 'README.md';
      workspace.setFilename(nextFile);
      await workspace.loadDocument({ mode: 'project', project: nextProject, filename: nextFile });
    }
  }, [workspace]);

  const handleSelectProject = useCallback(async (projectName: string) => {
    const nextFiles = await workspace.refreshFiles(projectName);
    const nextFile = nextFiles[0]?.filename || 'README.md';
    workspace.setProject(projectName);
    workspace.setFilename(nextFile);
    workspace.remember('css_editor_active_project', projectName);
    workspace.remember('css_editor_active_file', nextFile);
    await workspace.loadDocument({ mode: 'project', project: projectName, filename: nextFile });
  }, [workspace]);

  const handleCreateProject = useCallback(async () => {
    const name = window.prompt('New project directory name (e.g. dsa-2):')?.trim();
    if (!name) return;
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      window.alert(`Project creation failed: ${err.detail || response.status}`);
      return;
    }
    await workspace.refreshProjects();
    await handleSelectProject(name);
  }, [handleSelectProject, workspace]);

  const {
    config,
    modalOpen,
    setModalOpen,
    saveConfig,
    browseDirectory,
    saving,
    browsing,
    error,
  } = useConfig(onDirectoryChanged);

  const setAppStatus = useCallback((next: AppStatus, title = '') => {
    setStatus(next); setStatusTitle(title || next);
  }, []);
  useEditors(workspace, library);
  usePreview(frame, preferences.theme);
  useLiveSync(workspace, frame, preferences.theme, setAppStatus, setPageCount);
  useLayout(workspace, panes, divider, leftPane);

  useEffect(() => {
    const closeSettings = () => preferences.setSettingsOpen(false);
    document.addEventListener('click', closeSettings);
    return () => document.removeEventListener('click', closeSettings);
  }, [preferences]);

  const exportPdf = useCallback(async () => {
    posthog.trackExport(workspace.project, workspace.filename, workspace.current.current.markdown);
    setExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: workspace.current.current.markdown,
          css: workspace.effectiveCss(),
          filename: workspace.filename.replace(/\.md$/, '') || 'document',
          doc_path: workspace.current.current.docPath || undefined,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement('a'), { href: url, download: `${workspace.filename.replace(/\.md$/, '') || 'document'}.pdf` });
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { window.alert(`Export failed: ${(error as Error).message}`); }
    finally { setExporting(false); }
  }, [workspace]);

  const reloadConflict = useCallback(() => {
    const conflict = workspace.conflict;
    if (!conflict) return;
    if (conflict.markdown !== undefined) { workspace.setMarkdown(conflict.markdown); setEditorContent(workspace.refs.markdownView.current, conflict.markdown); }
    if (conflict.css !== undefined) { workspace.setCss(conflict.css); setEditorContent(workspace.refs.cssView.current, conflict.css); }
    if (conflict.project_css !== undefined) workspace.setProjectCss(conflict.project_css);
    if (conflict.html) updatePreview(frame.current, conflict.html, conflict.project_css ? `${conflict.project_css}\n${conflict.css || ''}` : conflict.css || '', preferences.theme, workspace.docToken);
    workspace.markClean('Reloaded from disk');
  }, [preferences.theme, workspace]);

  return <div className="app">
    <Toolbar projects={workspace.projects} project={workspace.project} files={workspace.files} filename={workspace.filename}
      dirty={workspace.dirty} status={status} statusTitle={statusTitle} exporting={exporting}
      settingsOpen={preferences.settingsOpen}
      mode={workspace.target.mode} docPath={workspace.docPath} onSwitchToProjects={switchToProjects}
      activeWatchTarget={workspace.activeWatchTarget} onOpenWatchFile={() => void openWatchFile()} onSwitchToWatch={() => void switchToWatch()}
      imageInput={workspace.refs.imageInput} onProject={(event) => void switchProject(event.target.value)} onFile={(event) => void switchFile(event.target.value)}
      onExport={() => void exportPdf()} onLibrary={() => setLibraryVisible((value) => !value)} libraryVisible={libraryVisible}
      onCss={() => setCssVisible((value) => !value)} cssVisible={cssVisible}
      onSettings={(event) => { event.stopPropagation(); preferences.setSettingsOpen((value) => !value); }} />
    {workspace.conflict && <ConflictBanner conflict={workspace.conflict} onReload={reloadConflict} onKeep={() => workspace.setConflict(null)} />}
    <SettingsSideWindow
      isOpen={preferences.settingsOpen}
      onClose={() => preferences.setSettingsOpen(false)}
      config={config}
      onOpenConfigModal={() => setModalOpen(true)}
      noCrop={preferences.noCrop}
      noWhitespace={preferences.noWhitespace}
      onNoCrop={(event) => preferences.changeNoCrop(event.target.checked)}
      onNoWhitespace={(event) => preferences.changeNoWhitespace(event.target.checked)}
      mode={workspace.target.mode}
      filename={workspace.filename}
      dirty={workspace.dirty}
      saveStatus={workspace.saveStatus}
      onSave={() => void workspace.saveDocument()}
      onSwitchToIdle={switchToIdle}
    />
    <WorkspacePanes refs={workspace.refs} library={library} panes={panes} divider={divider} leftPane={leftPane}
      libraryVisible={libraryVisible} cssVisible={cssVisible} noCrop={preferences.noCrop} noWhitespace={preferences.noWhitespace}
      frame={frame} pageCount={pageCount} theme={preferences.theme} onCss={() => setCssVisible((value) => !value)} onTheme={preferences.changeTheme} />
    {workspace.target.mode === 'idle' && (
      <IdleLauncher
        projects={workspace.projects}
        activeWatchTarget={workspace.activeWatchTarget}
        onOpenWatchFile={() => void openWatchFile()}
        onSelectProject={(projectName) => void handleSelectProject(projectName)}
        onCreateProject={() => void handleCreateProject()}
        onSwitchToWatch={() => void switchToWatch()}
      />
    )}
    <WelcomeModal
      config={config}
      isOpen={modalOpen}
      onClose={() => setModalOpen(false)}
      onSave={saveConfig}
      onBrowse={browseDirectory}
      saving={saving}
      browsing={browsing}
      error={error}
    />
  </div>;
}
