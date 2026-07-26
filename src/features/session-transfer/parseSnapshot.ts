/**
 * Validate a file the user picked before letting it near the doc.
 *
 * A snapshot arrives from outside the app — emailed, re-saved, hand-edited,
 * truncated by a flaky download. Everything downstream assumes seats have zones
 * and cards have ids, so this is the one place that assumption gets checked.
 *
 * Deliberately shallow: it confirms the *shape* the importer walks, not every
 * field's plausibility. A card with a nonsense name resolves to nothing and is
 * reported as unresolved, which is a better outcome than refusing the file.
 */
import {
  SESSION_SCHEMA_VERSION,
  SNAPSHOT_ZONES,
  emptyZones,
  type CardRef,
  type SeatSnapshot,
  type SessionSnapshot,
} from './sessionSnapshot';

export type ParseResult =
  | { ok: true; snapshot: SessionSnapshot }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseCardRef(value: unknown): CardRef | null {
  if (!isObject(value)) return null;
  if (typeof value.id !== 'string' || !value.id) return null;
  return {
    ...(value as unknown as CardRef),
    name: typeof value.name === 'string' ? value.name : '',
    cardNumber: typeof value.cardNumber === 'number' ? value.cardNumber : -1,
  };
}

function parseSeat(value: unknown): SeatSnapshot | null {
  if (!isObject(value)) return null;
  if (typeof value.seatId !== 'string' || !value.seatId) return null;

  const zones = emptyZones();
  const rawZones = isObject(value.zones) ? value.zones : {};
  for (const zone of SNAPSHOT_ZONES) {
    const raw = rawZones[zone];
    // A zone absent from an older file is an empty zone, not a broken file.
    zones[zone] = Array.isArray(raw)
      ? raw.map(parseCardRef).filter((c): c is CardRef => c !== null)
      : [];
  }

  return {
    seatId: value.seatId,
    name: typeof value.name === 'string' ? value.name : value.seatId.slice(0, 9),
    color: typeof value.color === 'string' ? value.color : '',
    joinedAt: typeof value.joinedAt === 'number' ? value.joinedAt : 0,
    health: typeof value.health === 'number' ? value.health : 40,
    customCounters: Array.isArray(value.customCounters) ? (value.customCounters as any[]) : [],
    deckRevealCount: typeof value.deckRevealCount === 'number' ? value.deckRevealCount : 0,
    allowViewHand: value.allowViewHand === true,
    zones,
  };
}

export function parseSnapshot(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a saved Aura game." };
  }

  if (!isObject(raw)) return { ok: false, error: "That file isn't a saved Aura game." };

  const version = raw.schemaVersion;
  if (typeof version !== 'number') {
    return { ok: false, error: "That file isn't a saved Aura game." };
  }
  if (version > SESSION_SCHEMA_VERSION) {
    // Refuse rather than partially apply: a newer file may carry state this
    // build would drop on the floor, and the player would not find out until
    // something was already missing from their game.
    return {
      ok: false,
      error: 'That game was saved by a newer version of Aura. Reload the page to update, then try again.',
    };
  }

  const seats = Array.isArray(raw.seats)
    ? raw.seats.map(parseSeat).filter((s): s is SeatSnapshot => s !== null)
    : [];

  if (seats.length === 0) {
    return { ok: false, error: 'That saved game has no players in it.' };
  }

  return {
    ok: true,
    snapshot: {
      schemaVersion: version,
      exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
      roomName: typeof raw.roomName === 'string' ? raw.roomName : '',
      seats,
      board: Array.isArray(raw.board)
        ? raw.board.map(parseCardRef).filter((c): c is CardRef => c !== null)
        : [],
      tokens: Array.isArray(raw.tokens) ? (raw.tokens as any[]) : [],
      actionLog: Array.isArray(raw.actionLog) ? (raw.actionLog as any[]) : [],
    },
  };
}
