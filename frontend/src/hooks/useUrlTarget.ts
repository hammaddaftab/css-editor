import { useSyncExternalStore } from 'react';
import type { Mode, WorkspaceSession, TargetSpec } from '../app-types';

let cachedSearch: string | null = null;
let cachedResult = {
  session: { watch: false, project: false } as WorkspaceSession,
  mode: { watch: false, project: false } as Mode,
  target: { mode: 'idle' } as TargetSpec,
};

/**
 * Strict parser for URL query parameters based on the 2-bit model:
 * watchActive, projectActive, plus focus ('watch' | 'project') when both are active.
 * Caches all derived objects so references remain 100% stable unless search actually changes.
 */
export function parseUrlSearch(search: string): { session: WorkspaceSession; mode: Mode; target: TargetSpec } {
  if (search === cachedSearch) return cachedResult;

  cachedSearch = search;
  const params = new URLSearchParams(search);

  const modeParam = params.get('mode')?.trim();
  const pathParam = params.get('path')?.trim();
  const projectParam = params.get('project')?.trim();
  const fileParam = params.get('file')?.trim();
  const customCssParam = params.get('custom_css')?.trim() || undefined;

  const hasWatch = Boolean(pathParam);
  const hasProject = Boolean(projectParam && fileParam);

  if (hasWatch && hasProject) {
    const focus = modeParam === 'project' ? 'project' : 'watch';
    const session: WorkspaceSession = {
      watch: true,
      project: true,
      focus,
      path: pathParam!,
      customCss: customCssParam,
      projectName: projectParam!,
      file: fileParam!,
    };
    const mode: Mode = { watch: true, project: true, focus };
    const target: TargetSpec = focus === 'project'
      ? { mode: 'project', project: projectParam!, filename: fileParam! }
      : { mode: 'watch', path: pathParam!, customCss: customCssParam };

    cachedResult = { session, mode, target };
    return cachedResult;
  }

  if (hasWatch && (modeParam === 'watch' || !modeParam)) {
    const session: WorkspaceSession = {
      watch: true,
      project: false,
      path: pathParam!,
      customCss: customCssParam,
    };
    const mode: Mode = { watch: true, project: false };
    const target: TargetSpec = { mode: 'watch', path: pathParam!, customCss: customCssParam };

    cachedResult = { session, mode, target };
    return cachedResult;
  }

  if (hasProject && (modeParam === 'project' || !modeParam)) {
    const session: WorkspaceSession = {
      watch: false,
      project: true,
      projectName: projectParam!,
      file: fileParam!,
    };
    const mode: Mode = { watch: false, project: true };
    const target: TargetSpec = { mode: 'project', project: projectParam!, filename: fileParam! };

    cachedResult = { session, mode, target };
    return cachedResult;
  }

  // Strict fallback: NoneActive
  cachedResult = {
    session: { watch: false, project: false },
    mode: { watch: false, project: false },
    target: { mode: 'idle' },
  };
  return cachedResult;
}

function subscribeToUrl(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener('urlchange', callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('urlchange', callback);
  };
}

export function updateUrlWithSession(session: WorkspaceSession, options?: { replace?: boolean }): void {
  const params = new URLSearchParams();

  if (session.watch && session.project) {
    params.set('mode', session.focus);
    if (session.focus === 'watch') {
      params.set('path', session.path);
      if (session.customCss) params.set('custom_css', session.customCss);
      params.set('project', session.projectName);
      params.set('file', session.file);
    } else {
      params.set('project', session.projectName);
      params.set('file', session.file);
      params.set('path', session.path);
      if (session.customCss) params.set('custom_css', session.customCss);
    }
  } else if (session.watch) {
    params.set('mode', 'watch');
    params.set('path', session.path);
    if (session.customCss) params.set('custom_css', session.customCss);
  } else if (session.project) {
    params.set('mode', 'project');
    params.set('project', session.projectName);
    params.set('file', session.file);
  }

  const search = params.toString();
  const nextUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  if (nextUrl !== currentUrl) {
    if (options?.replace) {
      window.history.replaceState(null, '', nextUrl);
    } else {
      window.history.pushState(null, '', nextUrl);
    }
    window.dispatchEvent(new Event('urlchange'));
  }
}

/**
 * React hook subscribing to URL query parameters.
 * Provides the session, mode, targetSpec, and state-machine transitions.
 */
export function useUrlTarget() {
  const getSnapshot = () => parseUrlSearch(typeof window === 'undefined' ? '' : window.location.search);
  const getServerSnapshot = () => ({
    session: { watch: false, project: false } as WorkspaceSession,
    mode: { watch: false, project: false } as Mode,
    target: { mode: 'idle' } as TargetSpec,
  });

  const parsed = useSyncExternalStore(subscribeToUrl, getSnapshot, getServerSnapshot);
  const { session, mode, target } = parsed;

  const initWatch = (path: string, customCss?: string, options?: { replace?: boolean }) => {
    if (session.project) {
      updateUrlWithSession({
        watch: true,
        project: true,
        focus: 'watch',
        path,
        customCss,
        projectName: session.projectName,
        file: session.file,
      }, options);
    } else {
      updateUrlWithSession({
        watch: true,
        project: false,
        path,
        customCss,
      }, options);
    }
  };

  const initProject = (project: string, file: string, options?: { replace?: boolean }) => {
    if (session.watch) {
      updateUrlWithSession({
        watch: true,
        project: true,
        focus: 'project',
        path: session.path,
        customCss: session.customCss,
        projectName: project,
        file,
      }, options);
    } else {
      updateUrlWithSession({
        watch: false,
        project: true,
        projectName: project,
        file,
      }, options);
    }
  };

  const switchToProject = (options?: { replace?: boolean }) => {
    if (session.watch && session.project) {
      updateUrlWithSession({
        ...session,
        focus: 'project',
      }, options);
    }
  };

  const switchToWatch = (options?: { replace?: boolean }) => {
    if (session.watch && session.project) {
      updateUrlWithSession({
        ...session,
        focus: 'watch',
      }, options);
    }
  };

  const switchFile = (nextFile: string, options?: { replace?: boolean }) => {
    if (session.project) {
      if (session.watch) {
        updateUrlWithSession({
          ...session,
          file: nextFile,
          focus: 'project',
        }, options);
      } else {
        updateUrlWithSession({
          watch: false,
          project: true,
          projectName: session.projectName,
          file: nextFile,
        }, options);
      }
    }
  };

  const switchProject = (nextProject: string, nextFile: string, options?: { replace?: boolean }) => {
    if (session.watch) {
      updateUrlWithSession({
        watch: true,
        project: true,
        focus: 'project',
        path: session.path,
        customCss: session.customCss,
        projectName: nextProject,
        file: nextFile,
      }, options);
    } else {
      updateUrlWithSession({
        watch: false,
        project: true,
        projectName: nextProject,
        file: nextFile,
      }, options);
    }
  };

  const switchToIdle = (options?: { replace?: boolean }) => {
    updateUrlWithSession({ watch: false, project: false }, options);
  };

  return {
    session,
    mode,
    target,
    initWatch,
    initProject,
    switchToProject,
    switchToWatch,
    switchFile,
    switchProject,
    switchToIdle,
  };
}
