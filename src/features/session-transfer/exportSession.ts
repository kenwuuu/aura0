/**
 * Read a live game out of the Y.Doc into a portable snapshot.
 *
 * Pure with respect to the doc — it reads and never writes, so exporting can
 * never disturb a game in progress. Any peer can export: the doc is replicated
 * in full, so one player's file contains the whole game, both seats included.
 */
import * as Y from 'yjs';
import {
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YDOC_ACTION_LOG,
  YSTATE_HEALTH,
  YSTATE_HAND,
  YSTATE_DECK,
  YSTATE_EXILE_PILE,
  YSTATE_DISCARD_PILE,
  YSTATE_SCRY,
  YSTATE_SIDEBOARD,
  YSTATE_CUSTOM_COUNTERS,
  YSTATE_CAN_VIEW_HAND,
  YSTATE_DECK_REVEAL_COUNT,
  YSTATE_PLAYER_NAME,
  YSTATE_PLAYER_COLOR,
  YSTATE_JOINED_AT,
  YSTATE_DECK_NAME,
} from '@/constants';
import { listSeats } from '@/features/player/listSeats';
import type { Card, CustomCounter } from '@/features/player/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import type { ActionLogEntry } from '@/features/action-log/types';
import {
  SESSION_SCHEMA_VERSION,
  SNAPSHOT_ZONES,
  emptyZones,
  toCardRef,
  type SeatSnapshot,
  type SessionSnapshot,
  type SnapshotZone,
} from './sessionSnapshot';

/** How many action-log entries travel with a snapshot. */
export const EXPORTED_ACTION_LOG_ENTRIES = 100;

/** Snapshot zone name → the Yjs key it lives under in a player's map. */
const ZONE_STATE_KEYS: Record<SnapshotZone, string> = {
  deck: YSTATE_DECK,
  hand: YSTATE_HAND,
  discard: YSTATE_DISCARD_PILE,
  exile: YSTATE_EXILE_PILE,
  scry: YSTATE_SCRY,
  sideboard: YSTATE_SIDEBOARD,
};

function exportSeat(playerId: string, map: Y.Map<any>): SeatSnapshot {
  const zones = emptyZones();
  for (const zone of SNAPSHOT_ZONES) {
    const cards = (map.get(ZONE_STATE_KEYS[zone]) as Card[] | undefined) ?? [];
    zones[zone] = cards.map((card) => toCardRef(card));
  }

  const deckName = map.get(YSTATE_DECK_NAME) as string | undefined;

  return {
    seatId: playerId,
    name: (map.get(YSTATE_PLAYER_NAME) as string | undefined) ?? playerId.slice(0, 9),
    color: (map.get(YSTATE_PLAYER_COLOR) as string | undefined) ?? '',
    ...(deckName ? { deckName } : {}),
    joinedAt: (map.get(YSTATE_JOINED_AT) as number | undefined) ?? 0,
    health: (map.get(YSTATE_HEALTH) as number | undefined) ?? 40,
    customCounters: (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [],
    deckRevealCount: (map.get(YSTATE_DECK_REVEAL_COUNT) as number | undefined) ?? 0,
    allowViewHand: (map.get(YSTATE_CAN_VIEW_HAND) as boolean | undefined) ?? false,
    zones,
  };
}

export function exportSession(yDoc: Y.Doc, roomName: string): SessionSnapshot {
  const board = [...yDoc.getMap<Card>(YDOC_CARDS_ON_BOARD).values()].map((card) =>
    toCardRef(card, { board: true }),
  );

  // Tokens export verbatim: every field is either a local asset path, a color,
  // or a position, so there is nothing to re-fetch and nothing to strip.
  const tokens = [...yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS).values()].map((t) => ({ ...t }));

  const log = yDoc.getArray<ActionLogEntry>(YDOC_ACTION_LOG).toArray();

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: Date.now(),
    roomName,
    seats: listSeats(yDoc).map(({ playerId, map }) => exportSeat(playerId, map)),
    board,
    tokens,
    // The tail, not the head — recent history is what gives a resumed game its
    // context ("who passed the turn last"). Bounded so the file stays small.
    actionLog: log.slice(-EXPORTED_ACTION_LOG_ENTRIES),
  };
}

/** How many cards a snapshot holds — the number the import preview quotes. */
export function countSnapshotCards(snapshot: SessionSnapshot): number {
  const inZones = snapshot.seats.reduce(
    (total, seat) =>
      total + SNAPSHOT_ZONES.reduce((sum, zone) => sum + seat.zones[zone].length, 0),
    0,
  );
  return inZones + snapshot.board.length;
}
