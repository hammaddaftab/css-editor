import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import type { UserConfig, Project } from '../../entities';

export interface SettingsSideWindowProps {
  isOpen: boolean;
  onClose: () => void;
  config: UserConfig | null;
  onOpenConfigModal: () => void;
  noCrop: boolean;
  noWhitespace: boolean;
  onNoCrop: (event: ChangeEvent<HTMLInputElement>) => void;
  onNoWhitespace: (event: ChangeEvent<HTMLInputElement>) => void;
  autosave?: boolean;
  onAutosave?: (event: ChangeEvent<HTMLInputElement>) => void;
  theme?: string;
  onTheme?: (theme: string) => void;
  libraryVisible?: boolean;
  onLibraryToggle?: () => void;
  cssVisible?: boolean;
  onCssToggle?: () => void;
  previewVisible?: boolean;
  onPreviewToggle?: () => void;
  mode?: 'idle' | 'watch' | 'project';
  filename?: string;
  dirty?: boolean;
  saveStatus?: string;
  onSave?: () => void;
  onSwitchToIdle?: () => void;
}

export interface WelcomeModalProps {
  config: UserConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: {
    projects_dir?: string;
    author_name?: string;
    author_email?: string;
    first_run_completed?: boolean;
  }) => Promise<any>;
  onBrowse: (current: string) => Promise<string | null>;
  saving: boolean;
  browsing: boolean;
  error: string | null;
}

export interface IdleLauncherProps {
  projects: Project[];
  activeWatchTarget?: { path: string; filename: string } | null;
  onOpenWatchFile: () => void;
  onSelectProject: (projectName: string) => Promise<void> | void;
  onCreateProject: () => Promise<void> | void;
  onSwitchToWatch: () => Promise<void> | void;
}
