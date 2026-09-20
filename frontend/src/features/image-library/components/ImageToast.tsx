export interface ImageToastProps {
  message: string | null;
}

export function ImageToast({ message }: ImageToastProps) {
  return (
    <div className={`image-library__toast${message ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {message || ''}
    </div>
  );
}
