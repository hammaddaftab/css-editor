import type { ImageItem } from '../types';
import { formatBytes } from '../imageStorage';
import { useImageCard } from '../hooks/useImageCard';

export interface ImageCardProps {
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

export function ImageCard(props: ImageCardProps) {
  const {
    cardRef,
    focusInputRef,
    nameInputRef,
    isDraggable,
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
  } = useImageCard(props);

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      draggable={isDraggable}
      data-url={props.image.url}
      data-filename={props.image.filename}
      onClick={handleCardClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleCardFocusOut}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Hidden Focus Input for browser-native focus/blur & scoped shortcuts */}
      <input
        ref={focusInputRef}
        type="text"
        className="image-card__focus-input"
        aria-label={`Image: ${props.image.filename}`}
        value={snippet}
        readOnly
        tabIndex={0}
        onFocus={props.onSelect}
        onBlur={handleFocusInputBlur}
        onKeyDown={handleKeyDown}
        onCopy={(e) => {
          const sel = window.getSelection();
          if (sel && sel.toString().trim().length > 0) return;
          e.preventDefault();
          triggerCopy();
        }}
      />

      <div className="image-card__thumb-wrap">
        <img
          className="image-card__thumb"
          src={props.image.url}
          alt={props.image.filename}
          loading="lazy"
        />
        <div className="image-card__drag-overlay">
          <span>⠿ Drag onto line</span>
        </div>
      </div>

      <div className="image-card__body">
        <div className="image-card__meta">
          <input
            ref={nameInputRef}
            type="text"
            className="image-card__name-input"
            value={editingFilename}
            title={props.image.filename}
            placeholder="Filename…"
            spellCheck={false}
            onMouseDown={handleFilenameMouseDown}
            onFocus={handleFilenameFocus}
            onMouseUp={handleFilenameMouseUp}
            onBlur={handleFilenameBlur}
            onChange={handleFilenameChange}
            onKeyDown={handleFilenameKeyDown}
          />
          <span className="image-card__size">{formatBytes(props.image.size)}</span>
        </div>
      </div>

      {badgeText && (
        <div className="image-card__badge-feedback">{badgeText}</div>
      )}
    </div>
  );
}
