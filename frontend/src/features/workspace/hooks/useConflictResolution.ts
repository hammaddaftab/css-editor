import { useCallback, type RefObject } from 'react';
import { setEditorContent } from '../../editor';
import { updatePreview } from '../../preview';
import type { WorkspaceState } from './useWorkspace';

export interface UseConflictResolutionOptions {
  workspace: WorkspaceState;
  frameA: RefObject<HTMLIFrameElement | null>;
  theme: string;
  setPageCount: (pages: string) => void;
}

export function useConflictResolution({
  workspace,
  frameA,
  theme,
  setPageCount,
}: UseConflictResolutionOptions) {
  const reloadConflict = useCallback(() => {
    const conflict = workspace.conflict;
    if (!conflict) return;
    if (conflict.markdown !== undefined) {
      workspace.setMarkdown(conflict.markdown);
      setEditorContent(workspace.refs.markdownView.current, conflict.markdown);
    }
    if (conflict.css !== undefined) {
      workspace.setCss(conflict.css);
      setEditorContent(workspace.refs.cssView.current, conflict.css);
    }
    if (conflict.project_css !== undefined) {
      workspace.setProjectCss(conflict.project_css);
    }
    if (conflict.html) {
      updatePreview(
        frameA.current,
        conflict.html,
        conflict.project_css ? `${conflict.project_css}\n${conflict.css || ''}` : conflict.css || '',
        theme,
        workspace.docToken,
        setPageCount,
      );
    }
    workspace.markClean('Reloaded from disk');
  }, [frameA, setPageCount, theme, workspace]);

  const dismissConflict = useCallback(() => {
    workspace.setConflict(null);
  }, [workspace]);

  return {
    reloadConflict,
    dismissConflict,
  };
}
