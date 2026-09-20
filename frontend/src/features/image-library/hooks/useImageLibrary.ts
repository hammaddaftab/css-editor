import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  type ForwardedRef,
  type RefObject,
  type ChangeEvent,
} from 'react';
import type { ImageItem, ImageLibraryHandle } from '../types';

export interface UseImageLibraryOptions {
  docPath?: string;
  visible?: boolean;
  noCrop?: boolean;
  noWhitespace?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  forwardedRef?: ForwardedRef<ImageLibraryHandle>;
  onRename?: (oldFilename: string, newFilename: string, oldPath?: string, newPath?: string) => void;
}

export function useImageLibrary({
  docPath = '',
  visible = true,
  noCrop = false,
  noWhitespace = false,
  fileInputRef: externalFileInputRef,
  forwardedRef,
  onRename,
}: UseImageLibraryOptions) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [focusedUrl, setFocusedUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(!visible);

  const containerRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const activeFileInputRef = externalFileInputRef || internalFileInputRef;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docPathRef = useRef(docPath);
  docPathRef.current = docPath;

  useEffect(() => {
    setIsCollapsed(!visible);
  }, [visible]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const getQuery = useCallback(() => {
    const currentDoc = docPathRef.current;
    return currentDoc ? `?doc=${encodeURIComponent(currentDoc)}` : '';
  }, []);

  const fetchImages = useCallback(async () => {
    const query = getQuery();
    if (!query) {
      setImages([]);
      return;
    }
    try {
      const res = await fetch(`/api/images${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ImageItem[] = await res.json();
      setImages(data);
    } catch (err) {
      console.error('Failed to fetch images:', err);
    }
  }, [getQuery]);

  useEffect(() => {
    void fetchImages();
  }, [docPath, fetchImages]);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<ImageItem[]> => {
      if (!files || files.length === 0) return [];

      setIsUploading(true);
      setUploadCount(files.length);

      const uploaded: ImageItem[] = [];
      const query = getQuery();

      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        try {
          const res = await fetch(`/api/images${query}`, {
            method: 'POST',
            body: form,
          });
          if (res.ok) {
            const data: ImageItem = await res.json();
            uploaded.push(data);
          } else {
            const errData = await res.json().catch(() => ({}));
            console.error(`Upload error for ${file.name}:`, errData.detail || res.statusText);
          }
        } catch (err) {
          console.error(`Upload network error for ${file.name}:`, err);
        }
      }

      setIsUploading(false);
      setUploadCount(0);

      await fetchImages();

      if (uploaded.length > 0) {
        setFocusedUrl(uploaded[0].url);
      }

      return uploaded;
    },
    [fetchImages, getQuery],
  );

  const deleteImage = useCallback(
    async (img: ImageItem) => {
      try {
        const query = getQuery();
        const res = await fetch(`/api/images/${encodeURIComponent(img.filename)}${query}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          showToast(`Deleted "${img.filename}" from library`);
          setSelectedFilename((prev) => (prev === img.filename ? null : prev));
          await fetchImages();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(`Failed to delete "${img.filename}": ${errData.detail || res.statusText}`);
        }
      } catch (err: any) {
        showToast(`Delete error: ${err.message}`);
      }
    },
    [fetchImages, getQuery, showToast],
  );

  const renameImage = useCallback(
    async (img: ImageItem, newFilename: string): Promise<boolean> => {
      const cleanNew = newFilename.trim();
      if (!cleanNew || cleanNew === img.filename) return false;
      try {
        const query = getQuery();
        const res = await fetch(`/api/images/${encodeURIComponent(img.filename)}${query}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_filename: cleanNew }),
        });
        if (res.ok) {
          const data = await res.json();
          const oldFilename = img.filename;
          const finalNewFilename = data.filename || cleanNew;
          const oldRelPath = img.rel_path;
          const newRelPath = data.rel_path || img.rel_path;
          const oldUrl = img.url;
          const newUrl = data.url || img.url;

          showToast(`Renamed to "${finalNewFilename}"`);
          await fetchImages();
          onRename?.(oldFilename, finalNewFilename, oldRelPath || oldUrl, newRelPath || newUrl);
          return true;
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(`Rename failed: ${errData.detail || res.statusText}`);
          return false;
        }
      } catch (err: any) {
        showToast(`Rename error: ${err.message}`);
        return false;
      }
    },
    [fetchImages, getQuery, onRename, showToast],
  );

  const copyImage = useCallback(
    async (img: ImageItem) => {
      const targetPath = img.rel_path || img.url;
      const snippet = `![img](${targetPath})`;

      try {
        await navigator.clipboard.writeText(snippet);
        showToast(`Copied markdown for "${img.filename}"`);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = snippet;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`Copied markdown for "${img.filename}"`);
      }
    },
    [showToast],
  );

  const focusImage = useCallback((url: string | null) => {
    setFocusedUrl(url);
  }, []);

  const selectImage = useCallback((filename: string) => {
    setSelectedFilename(filename);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFilename(null);
  }, []);

  // Clear selection on outside pointer interaction
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        clearSelection();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [clearSelection]);

  // Imperative handle
  useImperativeHandle(
    forwardedRef,
    () => ({
      fetchImages,
      uploadFiles,
      focusImage,
      selectImage,
      clearSelection,
      async setDoc(newDocPath: string) {
        docPathRef.current = newDocPath || '';
        clearSelection();
        await fetchImages();
      },
      toggle(show?: boolean) {
        setIsCollapsed((prev) => (typeof show === 'boolean' ? !show : !prev));
      },
    }),
    [clearSelection, fetchImages, focusImage, selectImage, uploadFiles],
  );

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    if (files.length > 0) {
      void uploadFiles(files);
    }
    e.target.value = '';
  };

  const handleBrowseClick = () => {
    activeFileInputRef.current?.click();
  };

  const asideClasses = [
    'image-library',
    noCrop ? 'nocrop-mode' : '',
    noWhitespace ? 'nowhitespace-mode' : '',
    isCollapsed ? 'is-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    images,
    selectedFilename,
    setSelectedFilename,
    focusedUrl,
    toastMessage,
    isUploading,
    uploadCount,
    asideClasses,
    containerRef,
    listRef,
    internalFileInputRef,
    uploadFiles,
    deleteImage,
    renameImage,
    copyImage,
    clearSelection,
    handleFileInputChange,
    handleBrowseClick,
  };
}
