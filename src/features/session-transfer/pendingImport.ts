/**
 * The hand-off across the navigation into a restored room.
 *
 * Import cannot write the doc from the page the user picked the file on: that
 * page holds a *different* room's doc and provider. So it mints the new room,
 * parks the snapshot here, and navigates — and the next boot picks it up in the
 * one window where writing is safe (after IndexedDB sync, before `Player`).
 *
 * **sessionStorage, not localStorage.** A pending import belongs to this tab and
 * this navigation. Parked in localStorage, an import abandoned midway (tab
 * closed on the progress screen, browser crash) would sit on disk and re-apply
 * itself the next time anyone opened that room — silently reverting whatever had
 * been played since. sessionStorage dies with the tab, which is the correct
 * lifetime for "I am in the middle of one navigation".
 */
import type { SessionSnapshot } from './sessionSnapshot';

const PENDING_PREFIX = 'aura:pending-import:';
const pendingKey = (roomName: string) => `${PENDING_PREFIX}${roomName}`;

export function stashPendingImport(roomName: string, snapshot: SessionSnapshot): void {
  try {
    sessionStorage.setItem(pendingKey(roomName), JSON.stringify(snapshot));
  } catch (error) {
    // Quota or a locked-down browser. Surfacing this is the caller's job — it
    // must not navigate to a room whose snapshot never got parked.
    console.error('Could not stage the imported game:', error);
    throw error;
  }
}

export function hasPendingImport(roomName: string): boolean {
  return sessionStorage.getItem(pendingKey(roomName)) !== null;
}

/**
 * Read and remove the pending snapshot for `roomName`.
 *
 * Removing on read is what makes a failed import fail *once*. If applying it
 * throws, the next reload boots an ordinary (if incomplete) room the player can
 * act on, rather than replaying the same crash forever.
 */
export function takePendingImport(roomName: string): SessionSnapshot | null {
  const key = pendingKey(roomName);
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;

  sessionStorage.removeItem(key);

  try {
    return JSON.parse(raw) as SessionSnapshot;
  } catch (error) {
    console.error('Discarding an unreadable pending import:', error);
    return null;
  }
}
