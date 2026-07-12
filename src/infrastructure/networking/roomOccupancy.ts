import type { Awareness } from 'y-protocols/awareness';
import type { AwarenessState } from './persistence';

/**
 * Number of actual players currently in the room, per awareness. Every real
 * client sets `playerId` on its own awareness state immediately on connect
 * (see bootstrap.ts) whether or not it's ever moved a cursor, so counting by
 * `playerId` (rather than e.g. cursor presence, which usePeerCursors uses)
 * is the general-purpose "is this a player" signal. Includes the local
 * client — a solo player counts as 1, not 0.
 */
export function countPlayersInRoom(awareness: Awareness): number {
  let count = 0;
  awareness.getStates().forEach((state) => {
    if ((state as AwarenessState).playerId) count++;
  });
  return count;
}

/**
 * Calls `onCountChange` with the current player count once immediately, then
 * again only when awareness churn (join/leave/reconnect) actually changes the
 * count — not on every unrelated awareness update (cursor moves, drags).
 * Returns an unsubscribe function.
 */
export function watchRoomOccupancy(
  awareness: Awareness,
  onCountChange: (playerCount: number) => void,
): () => void {
  let lastCount = countPlayersInRoom(awareness);
  onCountChange(lastCount);

  const handleChange = () => {
    const count = countPlayersInRoom(awareness);
    if (count !== lastCount) {
      lastCount = count;
      onCountChange(count);
    }
  };
  awareness.on('change', handleChange);
  return () => awareness.off('change', handleChange);
}
