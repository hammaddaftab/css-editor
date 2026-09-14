import { useCallback, useEffect, useState } from 'react';
import type { UserConfig } from '../app-types';

export function useConfig(onProjectsDirChanged?: () => Promise<void> | void) {
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UserConfig = await res.json();
      setConfig(data);
      if (data.is_first_run) {
        setModalOpen(true);
      }
      return data;
    } catch (err) {
      console.error('Failed to load user configuration:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (updates: {
    projects_dir?: string;
    author_name?: string;
    author_email?: string;
    first_run_completed?: boolean;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const nextData: UserConfig = await res.json();
      const dirChanged = config && config.projects_dir !== nextData.projects_dir;
      setConfig(nextData);
      setModalOpen(false);
      if (dirChanged && onProjectsDirChanged) {
        await onProjectsDirChanged();
      }
      return nextData;
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [config, onProjectsDirChanged]);

  const browseDirectory = useCallback(async (initialDir?: string) => {
    setBrowsing(true);
    try {
      const res = await fetch('/api/system/browse-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_dir: initialDir || config?.projects_dir }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.path as string | null;
    } catch (err) {
      console.error('Directory browse failed:', err);
      return null;
    } finally {
      setBrowsing(false);
    }
  }, [config?.projects_dir]);

  return {
    config,
    loading,
    saving,
    browsing,
    error,
    modalOpen,
    setModalOpen,
    fetchConfig,
    saveConfig,
    browseDirectory,
  };
}
