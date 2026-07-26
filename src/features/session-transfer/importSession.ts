/**
 * Write a snapshot back into a Y.Doc, re-fetching the card data it left out.
 *
 * ## Rehydrate by name, not by id
 *
 * A snapshot carries `scryfallId` for every card, so resolving by id looks like
 * the obvious choice. It is the wrong one: `fetchCardById` goes straight to
 * Scryfall by design (infrastructure/cards/CLAUDE.md), and that client is
 * throttled to 2 req/s (clients.ts) — 200 unique cards would take 100 seconds.
 * `fetchImagesForList` hits the Aura backend at 200/s with automatic Scryfall
 * fallback, and is the same path deck import already uses, so a whole game
 * rehydrates in about the time one deck import takes.
 *
 * The exception is **MTG tokens**, which must be resolved by id: a name lookup
 * for "Treasure" or "Clue" can return a real card instead of the token. There
 * are only ever a handful on a board, so the slow path is affordable there and
 * nowhere else.
 *
 * ## Ordering
 *
 * This must run *before* `Player` is constructed. Player seeds default state
 * into a doc that looks empty (Player.ts), and those defaults would win the
 * CRDT merge against an import that landed after them — the same hazard the
 * `whenSynced()` comment in bootstrap.ts describes. See bootstrap step 5a.
 */
import * as Y from 'yjs';
import {
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YDOC_ACTION_LOG,
  YDOC_SESSION,
  YDOC_SEAT_CLAIMS,
  YSESSION_SCHEMA_VERSION,
  YSESSION_IMPORTED_AT,
  YSESSION_SEATS,
  YDOC_PLAYER,
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
  YSTATE_DECK_CARD_COUNT,
  YSTATE_PLAYER_NAME,
  YSTATE_PLAYER_COLOR,
  YSTATE_JOINED_AT,
} from '@/constants';
import type { CardLookupService } from '@/infrastructure/cards';
import type { Card } from '@/features/player/types';
import { stripBackFace, type DeckLineItem } from '@/features/deck-manager/DeckListParser';
import {
  SNAPSHOT_ZONES,
  fromCardRef,
  boardCardFromRef,
  type CardRef,
  type SessionSnapshot,
  type SnapshotZone,
} from './sessionSnapshot';

export interface ApplyResult {
  /**
   * Names the lookup could not resolve. Those cards are still placed — with a
   * name and no art — because losing a card silently changes the game, while a
   * card without a picture is visibly wrong and the player can fix it.
   */
  unresolved: string[];
}

/** Snapshot zone name → the Yjs key it lives under in a player's map. */
const ZONE_STATE_KEYS: Record<SnapshotZone, string> = {
  deck: YSTATE_DECK,
  hand: YSTATE_HAND,
  discard: YSTATE_DISCARD_PILE,
  exile: YSTATE_EXILE_PILE,
  scry: YSTATE_SCRY,
  sideboard: YSTATE_SIDEBOARD,
};

/**
 * Lookup key for a card name — tolerant of case, stray whitespace, and back faces.
 *
 * The back face matters. A snapshot stores the full Scryfall name of a modal
 * double-faced card ("Shatterskull Smashing // Shatterskull, the Hammer Pass"),
 * and neither backend resolves that by name — deck import hits the same wall,
 * which is why `stripBackFace` exists. Stripping here means the request goes out
 * as the front face *and* the response (which comes back carrying the full name)
 * still keys back to the card that asked for it.
 */
function nameKey(name: string): string {
  return stripBackFace(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Every card ref in the snapshot, across every seat's zones and the board. */
export function allCardRefs(snapshot: SessionSnapshot): CardRef[] {
  const refs: CardRef[] = [];
  for (const seat of snapshot.seats) {
    for (const zone of SNAPSHOT_ZONES) refs.push(...seat.zones[zone]);
  }
  refs.push(...snapshot.board);
  return refs;
}

/** The card data a ref needs to become playable again. */
type Hydrated = Partial<Card>;

/**
 * Resolve every distinct card in the snapshot, by name in bulk and by id for
 * tokens. Never rejects: a lookup that fails leaves that card unhydrated rather
 * than failing the whole restore.
 */
async function resolveCardData(
  snapshot: SessionSnapshot,
  lookup: CardLookupService,
  onProgress?: (done: number, total: number) => void,
): Promise<{ byName: Map<string, Hydrated>; byScryfallId: Map<string, Hydrated> }> {
  const refs = allCardRefs(snapshot);

  const namedEntries = new Map<string, DeckLineItem>();
  const tokenIds = new Set<string>();

  for (const ref of refs) {
    if (ref.isToken) {
      if (ref.scryfallId) tokenIds.add(ref.scryfallId);
      continue;
    }
    const key = nameKey(ref.name);
    // Ask for the front face, for the reason `nameKey` documents.
    if (key && !namedEntries.has(key)) {
      namedEntries.set(key, { count: 1, name: stripBackFace(ref.name) });
    }
  }

  const total = namedEntries.size + tokenIds.size;
  let done = 0;
  const tick = () => onProgress?.(Math.min(++done, total), total);

  const byName = new Map<string, Hydrated>();
  const byScryfallId = new Map<string, Hydrated>();

  if (namedEntries.size > 0) {
    const run = await lookup.fetchImagesForList([...namedEntries.values()], (current) => {
      onProgress?.(Math.min(current, total), total);
    });
    done = Math.min(run.results.length, namedEntries.size);

    for (const result of run.results) {
      if (result.error) continue;
      byName.set(nameKey(result.name), {
        name: result.name,
        type_line: result.type_line,
        oracleText: result.oracleText,
        images: result.imageUris,
        scryfallId: result.scryfallId,
      });
    }
  }

  // Tokens, one id at a time. Concurrent because CardApiClient's own queue is
  // what throttles the requests — the same shape TokenService uses.
  await Promise.all(
    [...tokenIds].map(async (scryfallId) => {
      try {
        const card = await lookup.fetchCardById(scryfallId);
        const data = lookup.createCardDataResult(card);
        byScryfallId.set(scryfallId, {
          name: data.name,
          type_line: data.type_line,
          oracleText: data.oracleText,
          images: data.imageUris,
          scryfallId: data.scryfallId,
        });
      } catch (error) {
        console.error(`Session import: could not resolve token ${scryfallId}`, error);
      } finally {
        tick();
      }
    }),
  );

  return { byName, byScryfallId };
}

export async function applySessionSnapshot(
  yDoc: Y.Doc,
  snapshot: SessionSnapshot,
  lookup: CardLookupService,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  const { byName, byScryfallId } = await resolveCardData(snapshot, lookup, onProgress);

  const unresolved = new Set<string>();

  const hydrationFor = (ref: CardRef): Hydrated => {
    const hit = ref.isToken
      ? ref.scryfallId
        ? byScryfallId.get(ref.scryfallId)
        : undefined
      : byName.get(nameKey(ref.name));

    if (!hit) {
      unresolved.add(ref.name || ref.id);
      return {};
    }
    return hit;
  };

  const restorePile = (refs: CardRef[]): Card[] =>
    refs.map((ref) => fromCardRef(ref, hydrationFor(ref)));

  // One transaction: one undo step, one observer rebuild for every subscriber.
  // Writing zone by zone would make the board flicker through partial states as
  // each observer fires — the reasoning removePlayer.ts already applies.
  yDoc.transact(() => {
    for (const seat of snapshot.seats) {
      const map = yDoc.getMap<any>(YDOC_PLAYER(seat.seatId));

      for (const zone of SNAPSHOT_ZONES) {
        map.set(ZONE_STATE_KEYS[zone], restorePile(seat.zones[zone]));
      }

      map.set(YSTATE_HEALTH, seat.health);
      map.set(YSTATE_CUSTOM_COUNTERS, seat.customCounters);
      map.set(YSTATE_DECK_REVEAL_COUNT, seat.deckRevealCount);
      map.set(YSTATE_CAN_VIEW_HAND, seat.allowViewHand);
      map.set(YSTATE_JOINED_AT, seat.joinedAt);
      // Seeded so a seat is never nameless before its claimant boots. Whoever
      // claims it overwrites both from their own device — Player's constructor
      // treats localStorage as authoritative for the local player's identity.
      map.set(YSTATE_PLAYER_NAME, seat.name);
      map.set(YSTATE_PLAYER_COLOR, seat.color);
      // The *visible* deck count is its own Yjs key, not derived from the pile.
      // Forgetting it leaves a full library reading zero on the dock.
      map.set(YSTATE_DECK_CARD_COUNT, seat.zones.deck.length);
    }

    const yCards = yDoc.getMap<any>(YDOC_CARDS_ON_BOARD);
    for (const ref of snapshot.board) {
      yCards.set(ref.id, boardCardFromRef(ref, hydrationFor(ref)));
    }

    const yTokens = yDoc.getMap<any>(YDOC_KEYWORD_TOKENS);
    for (const token of snapshot.tokens) {
      yTokens.set(token.id, { ...token });
    }

    const yLog = yDoc.getArray(YDOC_ACTION_LOG);
    if (snapshot.actionLog.length > 0) yLog.push(snapshot.actionLog.map((e) => ({ ...e })));

    // Provenance. Its presence is what makes this room a *resumed* game, and is
    // what the seat picker reads to learn who was playing.
    const session = yDoc.getMap<any>(YDOC_SESSION);
    session.set(YSESSION_SCHEMA_VERSION, snapshot.schemaVersion);
    session.set(YSESSION_IMPORTED_AT, Date.now());
    session.set(
      YSESSION_SEATS,
      snapshot.seats.map((seat) => ({
        seatId: seat.seatId,
        name: seat.name,
        color: seat.color,
        health: seat.health,
        deckCount: seat.zones.deck.length,
        handCount: seat.zones.hand.length,
      })),
    );
  });

  return { unresolved: [...unresolved] };
}

/** Record that `seatId` in this doc is taken, so the picker stops offering it. */
export function claimSeat(yDoc: Y.Doc, seatId: string, peerId: string): void {
  yDoc.getMap<string>(YDOC_SEAT_CLAIMS).set(seatId, peerId);
}

/** Seat ids already claimed by some device. */
export function claimedSeatIds(yDoc: Y.Doc): Set<string> {
  return new Set(yDoc.getMap<string>(YDOC_SEAT_CLAIMS).keys());
}

export interface SeatOffer {
  seatId: string;
  name: string;
  color: string;
  health: number;
  deckCount: number;
  handCount: number;
}

/** The seats a restored game is offering, or null if this doc was never imported. */
export function readSessionSeats(yDoc: Y.Doc): SeatOffer[] | null {
  const session = yDoc.getMap<any>(YDOC_SESSION);
  const seats = session.get(YSESSION_SEATS) as SeatOffer[] | undefined;
  return Array.isArray(seats) ? seats : null;
}
