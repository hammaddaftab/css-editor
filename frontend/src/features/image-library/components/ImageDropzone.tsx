import { useImageDropzone } from '../hooks/useImageDropzone';

export interface ImageDropzoneProps {
  isUploading: boolean;
  uploadCount: number;
  onDropFiles: (files: File[]) => void;
  onBrowseClick: () => void;
}

export function ImageDropzone({
  isUploading,
  uploadCount,
  onDropFiles,
  onBrowseClick,
}: ImageDropzoneProps) {
  const {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleKeyDown,
  } = useImageDropzone({ onDropFiles, onBrowseClick });

  const classes = [
    'image-library__dropzone',
    isDragOver ? 'drag-over' : '',
    isUploading ? 'is-uploading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const text = isUploading
    ? `Uploading ${uploadCount} image(s)…`
    : 'Drop images here';

  return (
    <div
      className={classes}
      onClick={onBrowseClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      title="Click or drop images here to upload"
      onKeyDown={handleKeyDown}
    >
      <span className="dropzone-text">{text}</span>
    </div>
  );
}
