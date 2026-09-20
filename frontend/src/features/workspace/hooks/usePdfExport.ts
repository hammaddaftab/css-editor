import { useState, useCallback } from 'react';
import { posthog } from '@/lib';
import type { WorkspaceState } from './useWorkspace';

export function usePdfExport(workspace: WorkspaceState) {
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    posthog.trackExport(workspace.project, workspace.filename, workspace.current.current.markdown);
    setExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: workspace.current.current.markdown,
          css: workspace.effectiveCss(),
          filename: workspace.filename.replace(/\.md$/, '') || 'document',
          doc_path: workspace.current.current.docPath || undefined,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `${workspace.filename.replace(/\.md$/, '') || 'document'}.pdf`,
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`Export failed: ${(error as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [workspace]);

  return {
    exporting,
    exportPdf,
  };
}
