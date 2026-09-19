import { useSyncExternalStore } from 'react';
import type { Mode, WorkspaceSession, TargetSpec } from '../app-types';

let cachedSearch: string | null = null;
let cachedSession: WorkspaceSession = { watch: false, project: false };

/**
 * Strict parser for URL query parameters based on the 2-bit model:
 * watchActive, projectActive, plus focus ('watch' | 'project') when both are active.
 */
export function getSessionFromUrl(): WorkspaceSession {
  if (typeof window === 'undefined') return { watch: false, project: false };
  const search = window.location.search;
  if (search === cachedSearch) return cachedSession;

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
    cachedSession = {
      watch: true,
      project: true,
      focus,
      path: pathParam!,
      customCss: customCssParam,
      projectName: projectParam!,
      file: fileParam!,
    };
    return cachedSession;
  }

  if (hasWatch && (modeParam === 'watch' || !modeParam)) {
    cachedSession = {
      watch: true,
      project: false,
      path: pathParam!,
      customCss: customCssParam,
    };
    return cachedSession;
  }

  if (hasProject && (modeParam === 'project' || !modeParam)) {
    cachedSession = {
      watch: false,
      project: true,
      projectName: projectParam!,
      file: fileParam!,
    };
    return cachedSession;
  }

  // Strict fallback: NoneActive
  cachedSession = { watch: false, project: false };
  return cachedSession;
}

export function getModeFromSession(session: WorkspaceSession): Mode {
  if (!session.watch && !session.project) {
    return { watch: false, project: false };
  }
  if (session.watch && !session.project) {
    return { watch: true, project: false };
  }
  if (!session.watch && session.project) {
    return { watch: false, project: true };
  }
  return { watch: true, project: true, focus: session.focus };
}

export function getTargetSpecFromSession(session: WorkspaceSession): TargetSpec {
  if (!session.watch && !session.project) {
    return { mode: 'idle' };
  }
  if (session.watch && (!session.project || session.focus === 'watch')) {
    return { mode: 'watch', path: session.path, customCss: session.customCss };
  }
  if (session.project && (!session.watch || session.focus === 'project')) {
    return { mode: 'project', project: session.projectName, filename: session.file };
  }
  return { mode: 'idle' };
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
  const session = useSyncExternalStore(subscribeToUrl, getSessionFromUrl, () => ({ watch: false, project: false } as WorkspaceSession));
  const mode = getModeFromSession(session);
  const target = getTargetSpecFromSession(session);

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
