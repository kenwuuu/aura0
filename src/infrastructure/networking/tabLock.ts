/**
 * One tab per player, per room.
 *
 * The player id is stable in localStorage, but every tab builds its own Y.Doc
 * with its own Yjs clientID. Two tabs of the same browser in the same room are
 * therefore two CRDT replicas of the *same* player, both writing the player's
 * hand — which is stored as a whole array under one Y.Map key, so concurrent
 * writes resolve last-writer-wins and the loser's cards are simply gone. It
 * also breaks `Player.watchForHandClobber()`, whose premise is that the local
 * player is the sole author of their own hand: the other tab's perfectly
 * legitimate play arrives as a *remote* transaction that shrinks the hand, and
 * fires the clobber alarm.
 *
 * The fix is to let only one tab hold a room+player at a time. Web Locks are
 * the right primitive: the browser releases the lock when the tab closes or
 * crashes, so there is no stale-lock state to garbage-collect. Different rooms
 * take different locks, so having two rooms open side by side still works.
 */

/** A held tab lock. Releasing it lets a waiting tab take over. */
export interface TabLock {
  release(): void;
}

/** Locks are per room *and* per player — two different rooms may be open at once. */
export function tabLockKey(roomName: string, playerId: string): string {
  return `aura-tab:${roomName}:${playerId}`;
}

const takeoverChannelName = (key: string) => `${key}:takeover`;

/**
 * How long to wait for the holding tab to stand down before giving up. A tab
 * running an older build won't be listening for takeover requests at all, so
 * this has to fail rather than hang forever.
 */
const TAKEOVER_TIMEOUT_MS = 3000;

/** Web Locks are unavailable in some older browsers and in happy-dom under test. */
const locks = (): LockManager | undefined => globalThis.navigator?.locks;

/**
 * Hold `key` for as long as this tab lives.
 *
 * Resolves with the lock, or `null` if another tab already holds it. Where the
 * Web Locks API is missing we hand back a lock rather than block the player:
 * an un-enforced duplicate tab is the status quo, and it beats refusing to boot.
 */
export function acquireTabLock(key: string): Promise<TabLock | null> {
  return requestTabLock(key, { ifAvailable: true });
}

/**
 * Ask the tab currently holding `key` to stand down, then take the lock.
 *
 * The waiting request is queued *before* the holder is asked to release, so the
 * lock passes to us and not back to the holder when it reloads — Web Locks grant
 * in request order. Rejects if the holder never yields.
 */
export async function takeTabLock(key: string): Promise<TabLock> {
  const granted = requestTabLock(key, { ifAvailable: false });

  const channel = new BroadcastChannel(takeoverChannelName(key));
  channel.postMessage('stand-down');
  channel.close();

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('The other tab did not respond. Close it and try again.')),
      TAKEOVER_TIMEOUT_MS,
    ),
  );

  // `granted` only resolves null under `ifAvailable`, so this cast is safe here.
  return Promise.race([granted as Promise<TabLock>, timeout]);
}

/**
 * Holder side: run `handler` when another tab asks to take this room over.
 * Returns an unsubscribe function.
 */
export function onTabTakeoverRequest(key: string, handler: () => void): () => void {
  const channel = new BroadcastChannel(takeoverChannelName(key));
  channel.onmessage = () => handler();
  return () => channel.close();
}

/**
 * The Web Locks contract is inside-out for our purpose: the lock is held for
 * exactly as long as the callback's promise is pending, and `request()` resolves
 * only once that promise settles. So we hand the caller a `release` that settles
 * it, and deliberately never await `request()` itself — awaiting it would mean
 * waiting for our own lock to be released.
 */
function requestTabLock(key: string, { ifAvailable }: { ifAvailable: boolean }): Promise<TabLock | null> {
  const lockManager = locks();
  if (!lockManager) return Promise.resolve({ release: () => {} });

  return new Promise<TabLock | null>((resolve, reject) => {
    let release!: () => void;
    const heldUntilReleased = new Promise<void>((settle) => {
      release = settle;
    });

    lockManager
      .request(key, { ifAvailable }, (lock) => {
        if (!lock) {
          // Only reachable under ifAvailable: another tab holds it.
          resolve(null);
          return;
        }
        resolve({ release });
        return heldUntilReleased;
      })
      .catch(reject);
  });
}
