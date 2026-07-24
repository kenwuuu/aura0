/**
 * Removing a departed player from the room ("kick", not "ban").
 *
 * There is no server and no ban list — a player's "seat" is simply their
 * `YDOC_PLAYER(id)` map, which `buildPlaymatNodes` renders for every `player-*`
 * key in the shared doc. A player whose browser has closed/slept is dropped
 * from live awareness automatically, but their seat (health widget, piles) and
 * anything they left on the board persist in the doc — that's the ghost the
 * remaining players want gone.
 *
 * Yjs has no API to delete a top-level shared type, so we can't make the
 * `player-<id>` key disappear. Instead `removePlayer` tombstones it with
 * `YSTATE_REMOVED` (which the seat enumerators skip) and clears its contents,
 * then deletes every board card and token the player owns.
 *
 * This is deliberately a low-surface design: no persistent identity tracking,
 * nothing server-side. If a removed player reopens the room, `Player`'s
 * constructor clears the tombstone and re-seeds a fresh seat, so re-appearance
 * is self-correcting — a kick, never a ban.
 */

import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  YDOC_PLAYER,
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YSTATE_REMOVED,
} from '@/constants';
import { logAction } from '@/features/action-log/actionLog';
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useConfirmStore } from '@/app/stores/confirmStore';

/** Minimal shape of a board object — just enough to match it to its owner. The
 *  full `WhiteboardCard`/`KeywordToken` types live in other features; matching
 *  on `ownerId` alone keeps this module decoupled from them. */
interface OwnedBoardObject {
  ownerId: string;
}

/**
 * Remove a departed player's seat and board footprint from the shared game.
 *
 * Runs as a single Yjs transaction so peers never observe a half-removed seat
 * (one undo step, one observer rebuild). A no-op if asked to remove the actor
 * themselves — the local player is always online, and removing your own seat
 * would just be re-seeded on your next write.
 */
export function removePlayer(
  yDoc: Y.Doc,
  targetPlayerId: string,
  actorPlayerId: string,
): void {
  if (targetPlayerId === actorPlayerId) return;

  const name = resolvePlayerName(yDoc, targetPlayerId);
  const playerMap = yDoc.getMap(YDOC_PLAYER(targetPlayerId));
  const yCards = yDoc.getMap<OwnedBoardObject>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<OwnedBoardObject>(YDOC_KEYWORD_TOKENS);

  yDoc.transact(() => {
    // Clear the seat's contents (drops their piles, reclaims doc space) and
    // tombstone it so the seat enumerators skip it — the key can't be deleted.
    playerMap.clear();
    playerMap.set(YSTATE_REMOVED, true);

    // Sweep their battlefield cards and keyword tokens. Collect ids first, then
    // delete, so we never mutate a Y.Map while iterating it.
    const cardIds: string[] = [];
    yCards.forEach((card, id) => {
      if (card.ownerId === targetPlayerId) cardIds.push(id);
    });
    cardIds.forEach((id) => yCards.delete(id));

    const tokenIds: string[] = [];
    yTokens.forEach((token, id) => {
      if (token.ownerId === targetPlayerId) tokenIds.push(id);
    });
    tokenIds.forEach((id) => yTokens.delete(id));
  });

  logAction(yDoc, {
    actorId: actorPlayerId,
    type: 'remove_player',
    text: `removed ${name} from the game`,
  });
}

/** The stable playerIds of everyone currently connected, read from awareness.
 *  Every client sets `playerId` on its own awareness state on connect
 *  (bootstrap.ts), so this is the authoritative "who is live right now" set. */
function livePlayerIds(awareness: Awareness): Set<string> {
  const ids = new Set<string>();
  awareness.getStates().forEach((state) => {
    const pid = (state as { playerId?: string }).playerId;
    if (pid) ids.add(pid);
  });
  return ids;
}

/** Whether a player is currently connected to the room. */
export function isPlayerOnline(awareness: Awareness, playerId: string): boolean {
  return livePlayerIds(awareness).has(playerId);
}

export interface DepartedPlayer {
  playerId: string;
  name: string;
}

/**
 * Players who hold a seat in the doc but are not currently connected — the only
 * players the UI offers to remove. Excludes the local player (always online)
 * and any already-tombstoned seat.
 */
export function getDepartedPlayers(
  yDoc: Y.Doc,
  awareness: Awareness,
  localPlayerId: string,
): DepartedPlayer[] {
  const live = livePlayerIds(awareness);
  const departed: DepartedPlayer[] = [];
  yDoc.share.forEach((_, key) => {
    if (!key.startsWith('player-')) return;
    const playerId = key.slice('player-'.length);
    if (playerId === localPlayerId || live.has(playerId)) return;
    const map = yDoc.getMap(key);
    if (map.get(YSTATE_REMOVED) === true) return;
    departed.push({ playerId, name: resolvePlayerName(yDoc, playerId) });
  });
  return departed;
}

/**
 * Open the shared confirm dialog for removing `targetPlayerId`, and perform the
 * removal on confirm. The single entry point both UI surfaces (the ⌘K command
 * palette and a departed player's health-widget menu) call, so the confirmation
 * and the wiring can't drift between them.
 */
export function requestRemovePlayer(targetPlayerId: string): void {
  const { yDoc, playerId } = useGameInstance.getState();
  if (!yDoc || !playerId || targetPlayerId === playerId) return;

  const name = resolvePlayerName(yDoc, targetPlayerId);
  useConfirmStore.getState().open({
    title: `Remove ${name}?`,
    description:
      "Removes this player's seat, along with any cards and tokens they left on the board. If they rejoin the room, they'll get a fresh seat.",
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: () => removePlayer(yDoc, targetPlayerId, playerId),
  });
}
