import type { Conflict } from '../app-types';

type Props = { conflict: Conflict; onReload: () => void; onKeep: () => void };

export function ConflictBanner({ conflict, onReload, onKeep }: Props) {
  return (
    <div className="conflict-banner" role="alert">
      <div className="conflict-banner__text">
        <span className="conflict-banner__badge">External Change</span>
        <code>{conflict.filename}</code> was modified externally, but you have unsaved edits.
      </div>
      <div className="conflict-banner__actions">
        <button className="btn btn--xs btn--primary" onClick={onReload}>Reload from disk</button>
        <button className="btn btn--xs btn--ghost" onClick={onKeep}>Keep edits</button>
      </div>
    </div>
  );
}
