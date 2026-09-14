import type { Conflict } from '../app-types';

type Props = { conflict: Conflict; onReload: () => void; onKeep: () => void };

export function ConflictBanner({ conflict, onReload, onKeep }: Props) {
  return <div className="conflict-banner"><div className="conflict-banner__text"><strong>⚠️ Disk file changed:</strong> <code>{conflict.filename}</code> was modified externally, but you have unsaved edits.</div><div className="conflict-banner__actions"><button className="btn btn--xs btn--primary" onClick={onReload}>Reload from disk</button><button className="btn btn--xs btn--ghost" onClick={onKeep}>Keep my edits</button></div></div>;
}
