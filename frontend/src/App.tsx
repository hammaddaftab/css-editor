import { useCallback, useEffect, useRef, useState } from 'react';
import { setEditorContent } from './editor.js';
import { updatePreview } from './preview.js';
import { ConflictBanner } from './components/ConflictBanner';
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
  const { switchProject, switchFile } = useProjects(workspace);

  const onDirectoryChanged = useCallback(async () => {
    const available = await workspace.refreshProjects();
    if (available.length) {
      const nextProject = available[0].name;
      workspace.setProject(nextProject);
      await workspace.refs.imageLibrary.current?.setProject(nextProject);
      const nextFiles = await workspace.refreshFiles(nextProject);
      const nextFile = nextFiles[0]?.filename || 'README.md';
      workspace.setFilename(nextFile);
      await workspace.loadDocument(nextProject, nextFile);
    }
  }, [workspace]);

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
    setExporting(true);
    try {
      const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: workspace.current.current.markdown, css: workspace.effectiveCss(), filename: 'document' }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement('a'), { href: url, download: 'document.pdf' });
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
    if (conflict.html) updatePreview(frame.current, conflict.html, conflict.project_css ? `${conflict.project_css}\n${conflict.css || ''}` : conflict.css || '', preferences.theme);
    workspace.markClean('Reloaded from disk');
  }, [preferences.theme, workspace]);

  return <div className="app">
    <Toolbar projects={workspace.projects} project={workspace.project} files={workspace.files} filename={workspace.filename}
      dirty={workspace.dirty} saveStatus={workspace.saveStatus} status={status} statusTitle={statusTitle} exporting={exporting}
      settingsOpen={preferences.settingsOpen} noCrop={preferences.noCrop} noWhitespace={preferences.noWhitespace}
      config={config} onOpenConfigModal={() => setModalOpen(true)}
      imageInput={workspace.refs.imageInput} onProject={(event) => void switchProject(event.target.value)} onFile={(event) => void switchFile(event.target.value)}
      onSave={() => void workspace.saveDocument()} onExport={() => void exportPdf()} onLibrary={() => setLibraryVisible((value) => !value)} libraryVisible={libraryVisible}
      onCss={() => setCssVisible((value) => !value)} cssVisible={cssVisible}
      onSettings={(event) => { event.stopPropagation(); preferences.setSettingsOpen((value) => !value); }}
      onNoCrop={(event) => preferences.changeNoCrop(event.target.checked)} onNoWhitespace={(event) => preferences.changeNoWhitespace(event.target.checked)} />
    {workspace.conflict && <ConflictBanner conflict={workspace.conflict} onReload={reloadConflict} onKeep={() => workspace.setConflict(null)} />}
    <WorkspacePanes refs={workspace.refs} library={library} panes={panes} divider={divider} leftPane={leftPane}
      libraryVisible={libraryVisible} cssVisible={cssVisible} noCrop={preferences.noCrop} noWhitespace={preferences.noWhitespace}
      frame={frame} pageCount={pageCount} theme={preferences.theme} onCss={() => setCssVisible((value) => !value)} onTheme={preferences.changeTheme} />
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
