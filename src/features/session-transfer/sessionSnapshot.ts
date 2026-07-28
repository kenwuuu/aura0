/**
 * The session snapshot format — what an exported game *is*.
 *
 * The rule that shapes everything here: a snapshot records **which card and
 * where**, never what the card looks like. Names, oracle text, type lines and
 * image URIs are all re-fetched on import, which takes a ~1.1 KB hydrated card
 * down to ~110 bytes and makes a two-player Commander game about 25 KB instead
 * of 250 KB.
 *
 * Two fields survive that trimming for reasons worth stating:
 *
 * - **`id`** — token `attachedTo` references card ids, and the action log
 *   references seat ids. Preserving ids keeps a snapshot internally consistent,
 *   so nothing has to be remapped on the way back in.
 * - **`scryfallId`** — not used to rehydrate today (see importSession: the
 *   by-id endpoint is Scryfall-only and rate-limited to 2 req/s, which would
 *   turn a 2-second import into a 100-second one). It costs 38 bytes and buys
 *   exact-printing fidelity the day the Aura backend grows a bulk-by-id
 *   endpoint — at which point that becomes a one-function change with no
 *   schema migration.
 *
 * This module is pure: no Yjs, no network, no storage. exportSession.ts reads a
 * doc into these types and importSession.ts writes them back.
 */
import type { Card, CustomCounter, PileType } from '@/features/player/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import type { ActionLogEntry } from '@/features/action-log/types';

/**
 * Bump when a change would make an older build misread a newer file. Import
 * refuses anything newer than it knows rather than partially applying it.
 */
export const SESSION_SCHEMA_VERSION = 1;

/** Zones a seat owns, in the order the picker summarises them. */
export const SNAPSHOT_ZONES = [
  'deck',
  'hand',
  'discard',
  'exile',
  'scry',
  'sideboard',
] as const satisfies readonly PileType[];

export type SnapshotZone = (typeof SNAPSHOT_ZONES)[number];

/** A card reduced to identity plus position. Everything else is re-fetched. */
export interface CardRef {
  id: string;
  name: string;
  scryfallId?: string;
  cardNumber: number;
  commander?: boolean;
  /**
   * An MTG token (a Beast, a Treasure) rather than a real card. Import must
   * resolve these by id, never by name: a name lookup for "Treasure" or "Clue"
   * can return a real card instead of the token.
   */
  isToken?: boolean;

  // Board cards only. A card sitting in a pile has no meaningful position, and
  // writing one would be inventing state the export never observed.
  x?: number;
  y?: number;
  zIndex?: number;
  rotation?: number;
  isTapped?: boolean;
  isFlipped?: boolean;
  isSick?: boolean;
  counters?: number[];
  ownerId?: string;
}

export interface SeatSnapshot {
  /** The original player id. Preserved verbatim — see resolvePlayerIdForRoom. */
  seatId: string;
  /**
   * Display name at export time. **Labels the seat in the picker only.** It is
   * never restored as state: Player's constructor reseeds name and color from
   * the local device on every boot (Player.ts), because the human sitting at
   * the new device owns their own name.
   */
  name: string;
  color: string;
  /**
   * The deck this seat was playing, when it has a name. Absent for games saved
   * before `YSTATE_DECK_NAME` existed and for seats that never loaded a named
   * deck — see `seatIdentity.ts`, which is why it is worth carrying.
   */
  deckName?: string;
  joinedAt: number;
  health: number;
  customCounters: CustomCounter[];
  deckRevealCount: number;
  allowViewHand: boolean;
  zones: Record<SnapshotZone, CardRef[]>;
}

export interface SessionSnapshot {
  schemaVersion: number;
  exportedAt: number;
  /** The room this was exported from — provenance for the filename and preview. */
  roomName: string;
  seats: SeatSnapshot[];
  board: CardRef[];
  /** Verbatim: keyword tokens carry local asset paths and colors, no external data. */
  tokens: KeywordToken[];
  actionLog: ActionLogEntry[];
}

const TOKEN_ID_PREFIX = 'token-';

/** Is this an MTG token card (spawned from `all_parts`) rather than a real card? */
export function isTokenCard(card: Pick<Card, 'id'>): boolean {
  return card.id.startsWith(TOKEN_ID_PREFIX);
}

/**
 * Strip a card down to what a snapshot carries.
 *
 * `board: true` additionally keeps position and battlefield flags. Omitting it
 * for pile cards is deliberate — a card in the library has no position, and
 * round-tripping a stale one would resurrect where it happened to sit before it
 * was drawn.
 */
export function toCardRef(card: Card, opts: { board?: boolean } = {}): CardRef {
  const ref: CardRef = {
    id: card.id,
    name: card.name ?? '',
    cardNumber: card.cardNumber,
  };

  if (card.scryfallId) ref.scryfallId = card.scryfallId;
  if (card.commander) ref.commander = true;
  if (isTokenCard(card)) ref.isToken = true;

  if (opts.board) {
    ref.x = card.x;
    ref.y = card.y;
    ref.zIndex = (card as Card & { zIndex?: number }).zIndex ?? 0;
    ref.rotation = card.rotation;
    ref.isTapped = card.isTapped;
    ref.isFlipped = card.isFlipped;
    if (card.isSick) ref.isSick = true;
    if (card.counters?.length) ref.counters = [...card.counters];
    const ownerId = (card as Card & { ownerId?: string }).ownerId;
    if (ownerId) ref.ownerId = ownerId;
  }

  return ref;
}

/**
 * Rebuild a playable card from a ref plus whatever the lookup resolved.
 *
 * `hydrated` may be empty — a card whose name the lookup could not resolve is
 * still placed, with its name and no art. Dropping it would silently change the
 * game; showing it without a picture merely looks wrong, which the player can
 * see and fix.
 */
export function fromCardRef(ref: CardRef, hydrated: Partial<Card> = {}): Card {
  return {
    ...hydrated,
    id: ref.id,
    name: hydrated.name ?? ref.name,
    scryfallId: hydrated.scryfallId ?? ref.scryfallId,
    cardNumber: ref.cardNumber,
    ...(ref.commander ? { commander: true } : {}),
    x: ref.x ?? 0,
    y: ref.y ?? 0,
    rotation: ref.rotation ?? 0,
    isTapped: ref.isTapped ?? false,
    isFlipped: ref.isFlipped ?? false,
    ...(ref.isSick ? { isSick: true } : {}),
    counters: ref.counters ? [...ref.counters] : [],
  };
}

/** Rebuild a battlefield card — a Card plus the two fields the board adds. */
export function boardCardFromRef(
  ref: CardRef,
  hydrated: Partial<Card> = {},
): Card & { zIndex: number; ownerId: string } {
  return {
    ...fromCardRef(ref, hydrated),
    zIndex: ref.zIndex ?? 0,
    ownerId: ref.ownerId ?? '',
  };
}

/** Empty zones, so a seat is always built with all six present. */
export function emptyZones(): Record<SnapshotZone, CardRef[]> {
  return { deck: [], hand: [], discard: [], exile: [], scry: [], sideboard: [] };
}
