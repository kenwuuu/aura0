/**
 * Seat enumeration — the single definition of "who is in this game".
 *
 * A seat is a `player-<id>` top-level map in the doc. Two things about that are
 * easy to get wrong, which is why every caller must come through here:
 *
 * 1. **Removed seats linger.** Yjs cannot delete a top-level shared type, so a
 *    kicked player's map stays in the doc forever, tombstoned with
 *    `YSTATE_REMOVED` (see removePlayer.ts). Anything that enumerates seats and
 *    forgets the filter resurrects a ghost.
 * 2. **Order is meaning.** Seat index decides playmat placement, so it has to be
 *    identical for every peer — `joinedAt` ascending, with the player id as a
 *    tiebreak for the case where two peers stamp the same millisecond.
 */
import * as Y from 'yjs';
import { YSTATE_JOINED_AT, YSTATE_REMOVED } from '@/constants';

const PLAYER_KEY_PREFIX = 'player-';

export interface Seat {
  playerId: string;
  joinedAt: number;
  map: Y.Map<any>;
}

/** Every live seat in the doc, oldest first. Removed (kicked) seats are omitted. */
export function listSeats(yDoc: Y.Doc): Seat[] {
  const seats: Seat[] = [];

  yDoc.share.forEach((_, key) => {
    if (!key.startsWith(PLAYER_KEY_PREFIX)) return;
    const playerId = key.slice(PLAYER_KEY_PREFIX.length);
    const map = yDoc.getMap(key);
    if (map.get(YSTATE_REMOVED) === true) return;
    seats.push({
      playerId,
      joinedAt: (map.get(YSTATE_JOINED_AT) as number | undefined) ?? 0,
      map,
    });
  });

  seats.sort((a, b) =>
    a.joinedAt !== b.joinedAt
      ? a.joinedAt - b.joinedAt
      : a.playerId.localeCompare(b.playerId),
  );

  return seats;
}
