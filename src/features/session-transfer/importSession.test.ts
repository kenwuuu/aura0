import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { applySessionSnapshot, claimSeat, claimedSeatIds, readSessionSeats } from './importSession';
import { exportSession } from './exportSession';
import { seedGame } from '@/test/seedGame';
import { makeCard, makeCards, makeToken } from '@/test/factories';
import { createFakeCardLookup, fakeScryfallId } from '@/test/mocks/cardLookup';
import { Player } from '@/features/player/Player';
import {
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YDOC_PLAYER,
  YSTATE_HAND,
  YSTATE_DECK,
  YSTATE_HEALTH,
  YSTATE_DECK_CARD_COUNT,
} from '@/constants';
import { SESSION_SCHEMA_VERSION, emptyZones, toCardRef, type SessionSnapshot } from './sessionSnapshot';

const ROOM = 'mtg-testroom';

/** A snapshot with one seat, built from plain cards. */
function snapshotWith(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: 1_700_000_000_000,
    roomName: ROOM,
    seats: [
      {
        seatId: 'alice',
        name: 'Alice',
        color: '#ff0000',
        joinedAt: 1000,
        health: 33,
        customCounters: [],
        deckRevealCount: 0,
        allowViewHand: false,
        zones: { ...emptyZones(), hand: [toCardRef(makeCard({ name: 'Sol Ring' }))] },
      },
    ],
    board: [],
    tokens: [],
    actionLog: [],
    ...overrides,
  };
}

describe('applySessionSnapshot', () => {
  it('restores each seat\'s zones', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();

    await applySessionSnapshot(yDoc, snapshotWith(), service);

    const hand = yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND) as any[];
    expect(hand.map((c) => c.name)).toEqual(['Sol Ring']);
  });

  it('rehydrates the card data the snapshot left out', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();

    await applySessionSnapshot(yDoc, snapshotWith(), service);

    const [card] = yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND) as any[];
    expect(card.images.front.normal).toBe('https://img/sf-sol-ring.png');
    expect(card.oracleText).toBe('Sol Ring does something.');
  });

  it('restores health and the other per-seat state', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();

    await applySessionSnapshot(yDoc, snapshotWith(), service);

    expect(yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HEALTH)).toBe(33);
  });

  it('sets the visible deck count, which is its own Yjs key', async () => {
    // Derived nowhere: forget this and a full library reads zero on the dock.
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();
    const snapshot = snapshotWith();
    snapshot.seats[0].zones.deck = makeCards(37).map((c) => toCardRef(c));

    await applySessionSnapshot(yDoc, snapshot, service);

    expect(yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_DECK_CARD_COUNT)).toBe(37);
  });

  it('a Player constructed afterwards does not overwrite the imported state', async () => {
    // The ordering trap: Player seeds defaults into a doc that looks empty, and
    // those defaults would win the merge. Import must land first (bootstrap 5a).
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();
    await applySessionSnapshot(yDoc, snapshotWith(), service);

    new Player('alice', yDoc);

    const hand = yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND) as any[];
    expect(hand).toHaveLength(1);
    expect(yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HEALTH)).toBe(33);
  });

  it('restores board cards with their position and flags', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();
    const board = [
      toCardRef(
        makeCard({ id: 'card-b', name: 'Sol Ring', x: 400, y: 300, isTapped: true, ...{ zIndex: 5, ownerId: 'alice' } }),
        { board: true },
      ),
    ];

    await applySessionSnapshot(yDoc, snapshotWith({ board }), service);

    const card = yDoc.getMap(YDOC_CARDS_ON_BOARD).get('card-b') as any;
    expect(card).toMatchObject({ x: 400, y: 300, isTapped: true, zIndex: 5, ownerId: 'alice' });
  });

  it('restores keyword tokens still attached to their card', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();
    const tokens = [makeToken({ id: 'token-1', attachedTo: 'card-b' })];

    await applySessionSnapshot(yDoc, snapshotWith({ tokens }), service);

    expect((yDoc.getMap(YDOC_KEYWORD_TOKENS).get('token-1') as any).attachedTo).toBe('card-b');
  });

  it('resolves MTG tokens by id, and everything else by name', async () => {
    // Taking the by-id path for all 200 cards would turn a 2-second import into
    // a 100-second one; taking the by-name path for a token can return a real
    // card called "Treasure". Both halves of that matter.
    const yDoc = new Y.Doc();
    const { service, listCalls, byIdCalls } = createFakeCardLookup();
    const snapshot = snapshotWith();
    snapshot.seats[0].zones.hand.push(
      toCardRef(makeCard({ id: 'token-t1', name: 'Treasure', scryfallId: 'sf-treasure' })),
    );

    await applySessionSnapshot(yDoc, snapshot, service);

    expect(byIdCalls).toEqual(['sf-treasure']);
    expect(listCalls[0].map((e) => e.name)).toEqual(['Sol Ring']);
  });

  it('asks for each distinct name once, however many copies are in play', async () => {
    const yDoc = new Y.Doc();
    const { service, listCalls } = createFakeCardLookup();
    const snapshot = snapshotWith();
    snapshot.seats[0].zones.deck = [
      toCardRef(makeCard({ name: 'Forest' })),
      toCardRef(makeCard({ name: 'Forest' })),
      toCardRef(makeCard({ name: 'forest' })),
    ];

    await applySessionSnapshot(yDoc, snapshot, service);

    expect(listCalls[0].map((e) => e.name.toLowerCase()).sort()).toEqual(['forest', 'sol ring']);
  });

  it('still places a card whose name could not be resolved, and reports it', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup({ unresolvable: ['Sol Ring'] });

    const { unresolved } = await applySessionSnapshot(yDoc, snapshotWith(), service);

    expect(unresolved).toEqual(['Sol Ring']);
    const hand = yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND) as any[];
    expect(hand.map((c) => c.name)).toEqual(['Sol Ring']);
    expect(hand[0].images).toBeUndefined();
  });

  it('survives a token whose lookup fails', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup({ unresolvableIds: ['sf-treasure'] });
    const snapshot = snapshotWith();
    snapshot.seats[0].zones.hand = [
      toCardRef(makeCard({ id: 'token-t1', name: 'Treasure', scryfallId: 'sf-treasure' })),
    ];

    const { unresolved } = await applySessionSnapshot(yDoc, snapshot, service);

    expect(unresolved).toEqual(['Treasure']);
    expect(yDoc.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND)).toHaveLength(1);
  });

  it('writes the whole game in one transaction', async () => {
    // Zone-by-zone writes make every subscriber rebuild repeatedly, so the board
    // visibly flickers through partial states while a game is restoring.
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();
    let transactions = 0;
    yDoc.on('afterTransaction', () => { transactions += 1; });

    await applySessionSnapshot(yDoc, snapshotWith({ board: [toCardRef(makeCard(), { board: true })] }), service);

    expect(transactions).toBe(1);
  });

  it('records the seat roster the picker offers', async () => {
    const yDoc = new Y.Doc();
    const { service } = createFakeCardLookup();

    await applySessionSnapshot(yDoc, snapshotWith(), service);

    expect(readSessionSeats(yDoc)).toEqual([
      { seatId: 'alice', name: 'Alice', color: '#ff0000', health: 33, deckCount: 0, handCount: 1 },
    ]);
  });

  it('reports no seats for a doc that was never imported', () => {
    expect(readSessionSeats(new Y.Doc())).toBeNull();
  });

  it('is idempotent — applying twice leaves the same game', async () => {
    const snapshot = snapshotWith();
    const yDocA = new Y.Doc();
    const yDocB = new Y.Doc();
    const { service } = createFakeCardLookup();

    await applySessionSnapshot(yDocA, snapshot, service);
    await applySessionSnapshot(yDocB, snapshot, service);
    await applySessionSnapshot(yDocB, snapshot, service);

    expect(yDocB.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND))
      .toEqual(yDocA.getMap(YDOC_PLAYER('alice')).get(YSTATE_HAND));
  });
});

describe('seat claims', () => {
  it('reports nothing claimed on a freshly imported game', async () => {
    const yDoc = new Y.Doc();
    await applySessionSnapshot(yDoc, snapshotWith(), createFakeCardLookup().service);

    expect(claimedSeatIds(yDoc).size).toBe(0);
  });

  it('records a claim so the picker stops offering that seat', () => {
    const yDoc = new Y.Doc();

    claimSeat(yDoc, 'alice', 'peer-1');

    expect(claimedSeatIds(yDoc).has('alice')).toBe(true);
  });

  it('lets two devices claim two different seats without conflict', () => {
    const yDoc = new Y.Doc();

    claimSeat(yDoc, 'alice', 'peer-1');
    claimSeat(yDoc, 'bob', 'peer-2');

    expect([...claimedSeatIds(yDoc)].sort()).toEqual(['alice', 'bob']);
  });
});

describe('export → import round trip', () => {
  it('rebuilds a game that exports identically', async () => {
    // The catch-all: any field added to player state and carried through only
    // one direction fails here, whatever else passes.
    //
    // Fixture cards carry the scryfall id their name resolves to, because a
    // real card always does — import legitimately *enriches* a card that lacks
    // one, and that enrichment is not a round-trip failure.
    const realCard = (name: string, overrides = {}) =>
      makeCard({ name, scryfallId: fakeScryfallId(name), ...overrides });

    const { yDoc: source, player } = seedGame({
      playerId: 'alice',
      deck: makeCards(6, () => ({ scryfallId: fakeScryfallId('Lightning Bolt') })),
      hand: [realCard('Sol Ring')],
    });
    player.placeCardInPile(realCard('Counterspell'), 'discard');
    player.yPlayerState.set(YSTATE_HEALTH, 27);
    source.getMap(YDOC_CARDS_ON_BOARD).set(
      'card-b',
      realCard('Llanowar Elves', { id: 'card-b', x: 120, y: 80, isTapped: true, zIndex: 3, ownerId: 'alice' }),
    );
    source.getMap(YDOC_KEYWORD_TOKENS).set('token-1', makeToken({ id: 'token-1', attachedTo: 'card-b' }));

    const original = exportSession(source, ROOM);

    const restored = new Y.Doc();
    await applySessionSnapshot(restored, original, createFakeCardLookup().service);
    const reExported = exportSession(restored, ROOM);

    expect({ ...reExported, exportedAt: 0 }).toEqual({ ...original, exportedAt: 0 });
  });

  it('round-trips a two-seat game with both players\' zones intact', async () => {
    const { yDoc: source } = seedGame({ playerId: 'alice', deck: makeCards(4) });
    const bob = new Player('bob', source, makeCards(9));
    bob.drawCards(2);

    const original = exportSession(source, ROOM);
    const restored = new Y.Doc();
    await applySessionSnapshot(restored, original, createFakeCardLookup().service);

    const deckOf = (id: string) => (restored.getMap(YDOC_PLAYER(id)).get(YSTATE_DECK) as any[]).length;
    expect(deckOf('alice')).toBe(4);
    expect(deckOf('bob')).toBe(7);
    expect((restored.getMap(YDOC_PLAYER('bob')).get(YSTATE_HAND) as any[])).toHaveLength(2);
  });
});
