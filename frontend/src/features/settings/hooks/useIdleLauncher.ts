import { useState, useEffect } from 'react';
import type { Project } from '@/entities';

export function useIdleLauncher(projects: Project[]) {
  const [selectedProject, setSelectedProject] = useState('');

  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].name);
    }
  }, [projects, selectedProject]);

  const activeProject = selectedProject || projects[0]?.name || '';

  return {
    selectedProject: activeProject,
    setSelectedProject,
  };
}
