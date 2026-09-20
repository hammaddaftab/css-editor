import { useCallback, useRef, useState } from 'react';
import type { AppStatus } from '@/entities';
import { useEditors, useEditorActions } from '@/features/editor';
import { usePreview } from '@/features/preview';
import { Toolbar } from '@/features/toolbar';
import {
  SettingsSideWindow,
  WelcomeModal,
  IdleLauncher,
  usePreferences,
  useConfig,
} from '@/features/settings';
import {
  WorkspacePanes,
  ConflictBanner,
  useWorkspace,
  useProjects,
  useLiveSync,
  useAutosave,
  useLayout,
  usePdfExport,
  useConflictResolution,
  useWorkspaceShortcuts,
} from '@/features/workspace';

export default function App() {
  const workspace = useWorkspace();
  const frameA = useRef<HTMLIFrameElement>(null);
  const frameB = useRef<HTMLIFrameElement>(null);
  const previewScroll = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const leftPane = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<AppStatus>('idle');
  const [statusTitle, setStatusTitle] = useState('Connecting…');
  const [pageCount, setPageCount] = useState('');
  const [activeFrame, setActiveFrame] = useState<'A' | 'B'>('A');

  const {
    switchProject,
    switchFile,
    switchToProjects,
    openWatchFile,
    switchToWatch,
    switchToIdle,
    selectProject,
    createProject,
    onDirectoryChanged,
  } = useProjects(workspace);

  useWorkspaceShortcuts(openWatchFile);

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

  const preferences = usePreferences(frameA, config);
  const { exporting, exportPdf } = usePdfExport(workspace);
  const { reloadConflict, dismissConflict } = useConflictResolution({
    workspace,
    frameA,
    theme: preferences.theme,
    setPageCount,
  });
  const { insertImage, renameImageReference } = useEditorActions(workspace.refs.markdownView);

  const setAppStatus = useCallback((next: AppStatus, title = '') => {
    setStatus(next);
    setStatusTitle(title || next);
  }, []);

  useEditors(workspace);
  usePreview(frameA, frameB, previewScroll, preferences.theme, setPageCount, setActiveFrame);
  useLiveSync(workspace, frameA, preferences.theme, setAppStatus, setPageCount);
  useAutosave(workspace, preferences.autosave, preferences.autosaveDelay);
  useLayout(workspace, panes, divider, leftPane, preferences.previewVisible);

  return (
    <div className="app">
      <Toolbar
        projects={workspace.projects}
        project={workspace.project}
        files={workspace.files}
        filename={workspace.filename}
        dirty={workspace.dirty}
        saveStatus={workspace.saveStatus}
        autosave={preferences.autosave}
        status={status}
        statusTitle={statusTitle}
        exporting={exporting}
        settingsOpen={preferences.settingsOpen}
        mode={workspace.target.mode}
        watchActive={workspace.activeWatchTarget !== null}
        projectActive={workspace.project !== ''}
        docPath={workspace.docPath}
        activeWatchTarget={workspace.activeWatchTarget}
        onOpenWatchFile={() => void openWatchFile()}
        onSwitchToWatch={() => void switchToWatch()}
        onSwitchToProjects={() => void switchToProjects()}
        imageInput={workspace.refs.imageInput}
        onProject={(event) => void switchProject(event.target.value)}
        onFile={(event) => void switchFile(event.target.value)}
        onExport={() => void exportPdf()}
        onLibrary={preferences.toggleLibrary}
        libraryVisible={preferences.libraryVisible}
        onCss={preferences.toggleCss}
        cssVisible={preferences.cssVisible}
        onPreview={preferences.togglePreview}
        previewVisible={preferences.previewVisible}
        onSettings={(event) => {
          event.stopPropagation();
          preferences.setSettingsOpen(!preferences.settingsOpen);
        }}
      />
      {workspace.conflict && (
        <ConflictBanner
          conflict={workspace.conflict}
          onReload={reloadConflict}
          onKeep={dismissConflict}
        />
      )}
      <SettingsSideWindow
        isOpen={preferences.settingsOpen}
        onClose={() => preferences.setSettingsOpen(false)}
        config={config}
        onOpenConfigModal={() => setModalOpen(true)}
        noCrop={preferences.noCrop}
        noWhitespace={preferences.noWhitespace}
        onNoCrop={(event) => preferences.changeNoCrop(event.target.checked)}
        onNoWhitespace={(event) => preferences.changeNoWhitespace(event.target.checked)}
        autosave={preferences.autosave}
        onAutosave={(event) => preferences.changeAutosave(event.target.checked)}
        theme={preferences.theme}
        onTheme={preferences.changeTheme}
        libraryVisible={preferences.libraryVisible}
        onLibraryToggle={preferences.toggleLibrary}
        cssVisible={preferences.cssVisible}
        onCssToggle={preferences.toggleCss}
        previewVisible={preferences.previewVisible}
        onPreviewToggle={preferences.togglePreview}
        mode={workspace.target.mode}
        filename={workspace.filename}
        dirty={workspace.dirty}
        saveStatus={workspace.saveStatus}
        onSave={() => void workspace.saveDocument()}
        onSwitchToIdle={switchToIdle}
      />
      <WorkspacePanes
        refs={workspace.refs}
        panes={panes}
        divider={divider}
        leftPane={leftPane}
        docPath={workspace.docPath}
        libraryVisible={preferences.libraryVisible}
        cssVisible={preferences.cssVisible}
        previewVisible={preferences.previewVisible}
        noCrop={preferences.noCrop}
        noWhitespace={preferences.noWhitespace}
        onInsertImage={insertImage}
        onRenameImage={renameImageReference}
        frameA={frameA}
        frameB={frameB}
        activeFrame={activeFrame}
        previewScroll={previewScroll}
        pageCount={pageCount}
        theme={preferences.theme}
        onCss={preferences.toggleCss}
        onTheme={preferences.changeTheme}
      />
      {workspace.target.mode === 'idle' && (
        <IdleLauncher
          projects={workspace.projects}
          activeWatchTarget={workspace.activeWatchTarget}
          onOpenWatchFile={() => void openWatchFile()}
          onSelectProject={(projectName) => void selectProject(projectName)}
          onCreateProject={() => void createProject()}
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
    </div>
  );
}
