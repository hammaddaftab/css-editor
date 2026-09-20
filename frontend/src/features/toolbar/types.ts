import type { ChangeEvent, MouseEvent, RefObject } from 'react';
import type { AppStatus, Project, ProjectFile } from '../../entities';

export interface ToolbarProps {
  projects: Project[];
  project: string;
  files: ProjectFile[];
  filename: string;
  dirty: boolean;
  saveStatus?: string;
  autosave?: boolean;
  status: AppStatus;
  statusTitle: string;
  exporting: boolean;
  settingsOpen: boolean;
  mode?: 'idle' | 'watch' | 'project';
  watchActive?: boolean;
  projectActive?: boolean;
  docPath?: string;
  activeWatchTarget?: { path: string; filename: string } | null;
  onOpenWatchFile: () => void;
  onSwitchToWatch?: () => void;
  onSwitchToProjects?: () => void;
  imageInput: RefObject<HTMLInputElement | null>;
  onProject: (event: ChangeEvent<HTMLSelectElement>) => void;
  onFile: (event: ChangeEvent<HTMLSelectElement>) => void;
  onExport: () => void;
  onLibrary: () => void;
  libraryVisible: boolean;
  onCss: () => void;
  cssVisible: boolean;
  onPreview: () => void;
  previewVisible: boolean;
  onSettings: (event: MouseEvent<HTMLButtonElement>) => void;
}
