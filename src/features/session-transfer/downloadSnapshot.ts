/**
 * Hand a snapshot to the user as a file.
 *
 * Deliberately not pretty-printed: indentation adds ~40% to a file whose whole
 * point is being small enough to email or paste, and nothing reads it by eye.
 */
import type { SessionSnapshot } from './sessionSnapshot';

/** `aura-game-<room>-<YYYY-MM-DD>.json` — sortable, and names its own origin. */
export function snapshotFilename(snapshot: SessionSnapshot): string {
  const date = new Date(snapshot.exportedAt || Date.now()).toISOString().slice(0, 10);
  const room = snapshot.roomName || 'game';
  return `aura-game-${room}-${date}.json`;
}

export function downloadSnapshot(snapshot: SessionSnapshot): string {
  const filename = snapshotFilename(snapshot);
  const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoking synchronously can cancel the download in some browsers; a task tick
  // is enough for the click to have been consumed.
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return filename;
}
