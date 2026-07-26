/**
 * Bind this device to a seat in a restored game.
 *
 * Two writes, and both are mandatory — which is exactly why they live in one
 * function rather than at the two call sites that need them:
 *
 * 1. **The seat alias**, so `resolvePlayerIdForRoom` reports the restored seat
 *    id and the player boots into their own cards instead of beside them.
 * 2. **The room marked visited**, because `autoLoadDeckOnStart` treats any
 *    unvisited room as new and calls `player.reset()` + `loadNewDeck` on it
 *    (deck-manager/deckLoading.ts). On a device that has never seen this room —
 *    which is *every* device in a restore — that resets the seat it just
 *    adopted, dealing a fresh opening hand over the restored one.
 *
 * The second write is easy to miss because the room *is* new to this browser.
 * It is the game that isn't. Both `startImport` (the player holding the file)
 * and the seat picker (everyone who followed the link) go through here so that
 * reasoning cannot be applied on one path and forgotten on the other.
 */
import { setSeatAlias } from '@/infrastructure/networking';
import { markRoomVisited } from '@/features/room/RoomManager';

export function claimSeatOnThisDevice(roomName: string, seatId: string): void {
  setSeatAlias(roomName, seatId);
  markRoomVisited(roomName);
}
