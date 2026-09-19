import { useEffect, type RefObject } from 'react';

export function useLayout(
  workspace: any,
  panes: RefObject<HTMLDivElement | null>,
  divider: RefObject<HTMLDivElement | null>,
  leftPane: RefObject<HTMLDivElement | null>,
): void {
  const { refs, saveDocument } = workspace;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); void saveDocument();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveDocument]);

  useEffect(() => {
    const element = leftPane.current;
    if (!element) return;
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('application/x-editor-image')) return;
      event.preventDefault(); element.classList.add('drag-over');
    };
    const leave = () => element.classList.remove('drag-over');
    const drop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('application/x-editor-image')) return;
      event.preventDefault(); element.classList.remove('drag-over');
      const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
      if (files.length) void refs.imageLibrary.current?.uploadFiles(files);
    };
    element.addEventListener('dragover', over); element.addEventListener('dragleave', leave); element.addEventListener('drop', drop);
    return () => { element.removeEventListener('dragover', over); element.removeEventListener('dragleave', leave); element.removeEventListener('drop', drop); };
  }, [leftPane, refs.imageLibrary]);

  useEffect(() => {
    const handleDown = (event: globalThis.MouseEvent) => {
      if (!panes.current || !divider.current) return;
      const startX = event.clientX;
      const startLeft = parseFloat(getComputedStyle(panes.current).gridTemplateColumns.split(' ')[0]);
      const move = (next: globalThis.MouseEvent) => {
        const total = panes.current!.clientWidth - 4;
        const left = Math.max(200, Math.min(total - 200, startLeft + next.clientX - startX));
        panes.current!.style.gridTemplateColumns = `${left}px 4px ${total - left}px`;
      };
      const up = () => {
        divider.current?.classList.remove('dragging');
        panes.current?.classList.remove('dragging');
        document.body.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      divider.current.classList.add('dragging');
      panes.current.classList.add('dragging');
      document.body.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    divider.current?.addEventListener('mousedown', handleDown);
    return () => {
      divider.current?.removeEventListener('mousedown', handleDown);
      document.body.classList.remove('is-resizing');
      panes.current?.classList.remove('dragging');
    };
  }, [divider, panes]);
}
