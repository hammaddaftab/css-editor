import { forwardRef } from 'react';
import type { ImageLibraryHandle, ImageLibraryProps } from '../types';
import { useImageLibrary } from '../hooks/useImageLibrary';
import { ImageCard } from './ImageCard';
import { ImageDropzone } from './ImageDropzone';
import { ImageToast } from './ImageToast';

export const ImageLibrary = forwardRef<ImageLibraryHandle, ImageLibraryProps>(
  function ImageLibrary(props, ref) {
    const {
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
    } = useImageLibrary({ ...props, forwardedRef: ref });

    return (
      <aside className={asideClasses} ref={containerRef}>
        {/* Hidden file input if not externally provided */}
        {!props.fileInputRef && (
          <input
            ref={internalFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            multiple
            onChange={handleFileInputChange}
          />
        )}

        <div className="image-library__header">
          <div className="image-library__title">
            <span>Library</span>
            <span className="image-library__count">{images.length}</span>
          </div>
          <button
            id="upload-library-btn"
            className="btn btn--ghost btn--xs"
            title="Upload images"
            onClick={handleBrowseClick}
          >
            Upload
          </button>
        </div>

        <ImageDropzone
          isUploading={isUploading}
          uploadCount={uploadCount}
          onDropFiles={(files) => void uploadFiles(files)}
          onBrowseClick={handleBrowseClick}
        />

        <div
          className="image-library__list"
          ref={listRef}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.image-card')) {
              clearSelection();
            }
          }}
        >
          {images.length === 0 ? (
            <div className="image-library__empty">
              <p>No images yet</p>
              <span className="text-muted">Import or drag images above</span>
            </div>
          ) : (
            images.map((img, idx) => {
              const isSelected = selectedFilename === img.filename;
              const targetFilename = focusedUrl?.split('/').pop()?.split('?')[0];
              const isVicinityFocused = Boolean(
                focusedUrl &&
                  (img.url === focusedUrl ||
                    img.filename === targetFilename ||
                    img.url.endsWith(targetFilename || '')),
              );

              return (
                <ImageCard
                  key={img.filename}
                  image={img}
                  isSelected={isSelected}
                  isVicinityFocused={isVicinityFocused}
                  onSelect={() => setSelectedFilename(img.filename)}
                  onBlur={() => {
                    setSelectedFilename((prev) => (prev === img.filename ? null : prev));
                  }}
                  onInsert={props.onInsert}
                  onRename={(item, newFilename) => renameImage(item, newFilename)}
                  onDelete={() => void deleteImage(img)}
                  onCopy={() => void copyImage(img)}
                  onNavigateNext={() => {
                    if (idx < images.length - 1) {
                      setSelectedFilename(images[idx + 1].filename);
                    }
                  }}
                  onNavigatePrev={() => {
                    if (idx > 0) {
                      setSelectedFilename(images[idx - 1].filename);
                    }
                  }}
                />
              );
            })
          )}
        </div>

        <ImageToast message={toastMessage} />
      </aside>
    );
  },
);
