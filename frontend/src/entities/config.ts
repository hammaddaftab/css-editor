export type UserConfig = {
  projects_dir: string;
  default_projects_dir: string;
  app_projects_dir: string;
  author_name: string;
  author_email: string;
  first_run_completed: boolean;
  welcome_seeded: boolean;
  is_first_run: boolean;
  config_file_path: string;
  projects_dir_exists: boolean;
  dialog_supported: boolean;
  anonymous_id?: string;
  preview_theme?: 'light' | 'dark';
  library_open?: boolean;
  css_open?: boolean;
  preview_open?: boolean;
  no_crop?: boolean;
  no_whitespace?: boolean;
};

export type AppStatus = 'idle' | 'connected' | 'rendering' | 'error';
