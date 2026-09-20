import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type FocusEvent,
  type MouseEvent,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import type { ImageItem } from '../types';

export interface UseImageCardOptions {
  image: ImageItem;
  isSelected: boolean;
  isVicinityFocused: boolean;
  onSelect: () => void;
  onBlur: () => void;
  onInsert?: (snippet: string) => void;
  onRename?: (image: ImageItem, newFilename: string) => Promise<boolean> | void;
  onDelete: (image: ImageItem) => void;
  onCopy: (image: ImageItem) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
}

export function useImageCard({
  image,
  isSelected,
  isVicinityFocused,
  onSelect,
  onBlur,
  onInsert,
  onRename,
  onDelete,
  onCopy,
  onNavigateNext,
  onNavigatePrev,
}: UseImageCardOptions) {
  const [editingFilename, setEditingFilename] = useState(image.filename);
  const [badgeText, setBadgeText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const focusInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const wasAlreadyFocusedRef = useRef(false);

  // Sync external filename updates
  useEffect(() => {
    setEditingFilename(image.filename);
  }, [image.filename]);

  // Scroll into view when vicinity focused
  useEffect(() => {
    if (isVicinityFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isVicinityFocused]);

  // Focus the input if selected externally
  useEffect(() => {
    if (isSelected && focusInputRef.current && document.activeElement !== focusInputRef.current) {
      if (!cardRef.current?.contains(document.activeElement)) {
        focusInputRef.current.focus();
      }
    }
  }, [isSelected]);

  const targetPath = image.rel_path || image.url;
  // Always use the standard alt text "img" with the exact image target path
  const snippet = `![img](${targetPath})`;

  const triggerCopy = () => {
    onCopy(image);
    setBadgeText('Copied');
    setTimeout(() => setBadgeText(null), 1200);
  };

  // Keyboard shortcuts on focus input
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) return; // Yield to active text selection
      e.preventDefault();
      triggerCopy();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Del') {
      e.preventDefault();
      onDelete(image);
      return;
    }

    if (e.key === 'Escape') {
      onBlur();
      focusInputRef.current?.blur();
      return;
    }

    if (e.key === 'Enter') {
      if (onInsert) {
        onInsert(`\n${snippet}\n`);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNavigateNext?.();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onNavigatePrev?.();
    }
  };

  // Blur & Focus lifecycle
  const handleFocusInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget && cardRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    onBlur();
  };

  const handleCardFocusOut = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && cardRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    onBlur();
  };

  // Click handlers
  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === nameInputRef.current) return;
    focusInputRef.current?.focus();
    onSelect();
  };

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === nameInputRef.current) return;
    if (onInsert) {
      onInsert(`\n${snippet}\n`);
    }
  };

  // Filename editing in persistent storage
  const commitRename = async () => {
    const trimmed = editingFilename.trim();
    if (!trimmed || trimmed === image.filename) {
      setEditingFilename(image.filename);
      return;
    }
    try {
      await onRename?.(image, trimmed);
    } catch {
      setEditingFilename(image.filename);
    }
  };

  const handleFilenameMouseDown = (e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    wasAlreadyFocusedRef.current = document.activeElement === nameInputRef.current;
    onSelect();
  };

  const handleFilenameFocus = () => {
    onSelect();
    if (!wasAlreadyFocusedRef.current) {
      requestAnimationFrame(() => {
        nameInputRef.current?.select();
      });
    }
  };

  const handleFilenameMouseUp = (e: MouseEvent<HTMLInputElement>) => {
    if (!wasAlreadyFocusedRef.current) {
      e.preventDefault();
      nameInputRef.current?.select();
    }
  };

  const handleFilenameBlur = (e: FocusEvent<HTMLInputElement>) => {
    wasAlreadyFocusedRef.current = false;
    void commitRename();
    if (e.relatedTarget && cardRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    onBlur();
  };

  const handleFilenameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditingFilename(e.target.value);
  };

  const handleFilenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.stopPropagation();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingFilename(image.filename);
      nameInputRef.current?.blur();
    }
  };

  // Drag handlers: always use alt "img" and the exact filename
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const payload = {
      url: image.url,
      alt: 'img',
      filename: image.filename,
      rel_path: image.rel_path,
    };
    e.dataTransfer.setData('application/x-editor-image', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', snippet);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const cardClasses = [
    'image-card',
    isSelected ? 'is-selected' : '',
    isVicinityFocused ? 'is-focused' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    cardRef,
    focusInputRef,
    nameInputRef,
    isDraggable: !wasAlreadyFocusedRef.current,
    editingFilename,
    badgeText,
    snippet,
    cardClasses,
    triggerCopy,
    handleKeyDown,
    handleFocusInputBlur,
    handleCardFocusOut,
    handleCardClick,
    handleDoubleClick,
    handleFilenameMouseDown,
    handleFilenameFocus,
    handleFilenameMouseUp,
    handleFilenameBlur,
    handleFilenameChange,
    handleFilenameKeyDown,
    handleDragStart,
    handleDragEnd,
  };
}
