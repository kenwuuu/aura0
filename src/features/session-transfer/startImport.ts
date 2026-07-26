/**
 * Begin restoring a game: mint a room for it and navigate there.
 *
 * Everything here happens *before* the new room's doc exists, and the order is
 * load-bearing. Three things must be true by the time the next boot runs:
 *
 * 1. **The seat alias is written**, so `resolvePlayerIdForRoom` reports the
 *    restored seat id rather than this device's own — otherwise the player
 *    boots as a stranger next to their own cards.
 * 2. **The room is marked visited.** `autoLoadDeckOnStart` treats any unvisited
 *    room as new and calls `player.reset()` on it (deck-manager/deckLoading.ts),
 *    which would wipe the restored game moments after it was written. Marking it
 *    first reuses the existing "not a fresh room" meaning rather than adding a
 *    second flag for the same idea.
 * 3. **The snapshot is parked**, for the next boot to pick up.
 *
 * A brand-new room id, never the one the snapshot came from: the original room's
 * doc may still be alive on another device, and rejoining it would merge two
 * divergent histories instead of restoring one.
 */
import { ROOM_PREFIX } from '@/constants';
import { randomIdSuffix } from '@/shared/utils/ids';
import { setSeatAlias } from '@/infrastructure/networking';
import { markRoomVisited } from '@/features/room/RoomManager';
import { stashPendingImport } from './pendingImport';
import type { SessionSnapshot } from './sessionSnapshot';

/** Flags a link as pointing at a restored game — see `isResumeLink`. */
export const RESUME_PARAM = 'resume';

export interface StartImportOptions {
  /** Override the minted room id. Tests only. */
  roomName?: string;
  /** Override navigation. Tests only. */
  navigate?: (url: string) => void;
}

/**
 * @param seatId the seat the importing player is taking. Every *other* seat is
 *   left unclaimed for whoever opens the invite link.
 * @returns the room the game is being restored into.
 */
export function startImport(
  snapshot: SessionSnapshot,
  seatId: string,
  options: StartImportOptions = {},
): string {
  const roomName = options.roomName ?? `${ROOM_PREFIX}${randomIdSuffix(7)}`;

  // Park the snapshot first: if storage refuses it, this throws before anything
  // has been mutated and before we have navigated to a room that would boot empty.
  stashPendingImport(roomName, snapshot);

  setSeatAlias(roomName, seatId);
  markRoomVisited(roomName);

  const url = `?room=${encodeURIComponent(roomName)}&${RESUME_PARAM}=1`;
  (options.navigate ?? ((target: string) => window.location.assign(target)))(url);

  return roomName;
}

/**
 * Is this page a link into a restored game?
 *
 * The flag has to live in the URL because the doc cannot answer the question:
 * `whenSynced()` resolves on IndexedDB alone (YjsNetworkFactory), so a player
 * opening an invite link has an *empty* doc at the moment bootstrap needs to
 * decide whether to offer them a seat. Remote state arrives later. The link is
 * the only thing that knows in time.
 *
 * It rides along for free once set: `copyRoomLink` copies `window.location.href`.
 */
export function isResumeLink(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(RESUME_PARAM) === '1';
}
