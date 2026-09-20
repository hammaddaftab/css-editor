import { useEffect, useState, type FormEvent } from 'react';
import type { UserConfig } from '@/entities';

export interface UseWelcomeFormOptions {
  config: UserConfig | null;
  isOpen: boolean;
  onSave: (config: {
    projects_dir?: string;
    author_name?: string;
    author_email?: string;
    first_run_completed?: boolean;
  }) => Promise<any>;
  onBrowse: (current: string) => Promise<string | null>;
  onClose: () => void;
  error?: string | null;
}

export function useWelcomeForm({
  config,
  isOpen,
  onSave,
  onBrowse,
  onClose,
  error: initialError,
}: UseWelcomeFormOptions) {
  const [projectsDir, setProjectsDir] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setProjectsDir(config.projects_dir || config.default_projects_dir || '');
      setAuthorName(config.author_name || '');
      setAuthorEmail(config.author_email || '');
    }
  }, [config, isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const cleanDir = projectsDir.trim();
    if (!cleanDir) {
      setLocalError('Please specify a projects directory.');
      return;
    }

    try {
      await onSave({
        projects_dir: cleanDir,
        author_name: authorName.trim(),
        author_email: authorEmail.trim(),
        first_run_completed: true,
      });
      onClose();
    } catch (err) {
      setLocalError((err as Error).message);
    }
  };

  const handleBrowse = async () => {
    setLocalError(null);
    const chosen = await onBrowse(projectsDir);
    if (chosen) {
      setProjectsDir(chosen);
    }
  };

  const error = localError || initialError;

  return {
    projectsDir,
    setProjectsDir,
    authorName,
    setAuthorName,
    authorEmail,
    setAuthorEmail,
    error,
    handleSubmit,
    handleBrowse,
  };
}
