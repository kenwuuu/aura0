import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { exportSession, countSnapshotCards } from './exportSession';
import { seedGame } from '@/test/seedGame';
import { makeCard, makeCards, makeToken } from '@/test/factories';
import { removePlayer } from '@/features/player/removePlayer';
import { Player } from '@/features/player/Player';
import {
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YDOC_ACTION_LOG,
  YSTATE_HEALTH,
} from '@/constants';

const ROOM = 'mtg-testroom';

describe('exportSession', () => {
  it('exports one seat per seated player', () => {
    const { yDoc } = seedGame({ playerId: 'alice' });
    new Player('bob', yDoc);

    const snapshot = exportSession(yDoc, ROOM);

    expect(snapshot.seats.map((s) => s.seatId).sort()).toEqual(['alice', 'bob']);
  });

  it('records each zone with the right cards', () => {
    const { yDoc, player } = seedGame({
      playerId: 'alice',
      deck: makeCards(5),
      hand: [makeCard({ name: 'Lightning Bolt' })],
    });
    player.placeCardInPile(makeCard({ name: 'Counterspell' }), 'discard');

    const [seat] = exportSession(yDoc, ROOM).seats;

    expect(seat.zones.deck).toHaveLength(5);
    expect(seat.zones.hand.map((c) => c.name)).toEqual(['Lightning Bolt']);
    expect(seat.zones.discard.map((c) => c.name)).toEqual(['Counterspell']);
    expect(seat.zones.exile).toEqual([]);
  });

  it('strips the re-fetchable card data that makes a snapshot big', () => {
    const { yDoc } = seedGame({
      playerId: 'alice',
      hand: [makeCard({ name: 'Solemn Simulacrum', scryfallId: 'sf-1' })],
    });

    const [card] = exportSession(yDoc, ROOM).seats[0].zones.hand;

    expect(card).not.toHaveProperty('images');
    expect(card).not.toHaveProperty('oracleText');
    expect(card).not.toHaveProperty('type_line');
    // Identity survives — that is what makes it re-fetchable.
    expect(card.name).toBe('Solemn Simulacrum');
    expect(card.scryfallId).toBe('sf-1');
  });

  it('gives pile cards no position, because a card in a pile has none', () => {
    const { yDoc } = seedGame({
      playerId: 'alice',
      hand: [makeCard({ x: 400, y: 300, isTapped: true })],
    });

    const [card] = exportSession(yDoc, ROOM).seats[0].zones.hand;

    expect(card.x).toBeUndefined();
    expect(card.isTapped).toBeUndefined();
  });

  it('keeps position and battlefield flags for board cards', () => {
    const { yDoc } = seedGame({ playerId: 'alice' });
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set(
      'card-board',
      makeCard({ id: 'card-board', x: 400, y: 300, isTapped: true, counters: [2, 0], ...{ zIndex: 7, ownerId: 'alice' } }),
    );

    const [card] = exportSession(yDoc, ROOM).board;

    expect(card).toMatchObject({
      id: 'card-board',
      x: 400,
      y: 300,
      zIndex: 7,
      isTapped: true,
      counters: [2, 0],
      ownerId: 'alice',
    });
  });

  it('keeps token attachedTo pointing at a card that is also in the export', () => {
    // Referential integrity is the property most likely to break silently under
    // a refactor: a token whose parent id no longer exists renders unparented.
    const { yDoc } = seedGame({ playerId: 'alice' });
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set(
      'card-host',
      makeCard({ id: 'card-host', ...{ zIndex: 1, ownerId: 'alice' } }),
    );
    yDoc.getMap(YDOC_KEYWORD_TOKENS).set(
      'token-1',
      makeToken({ id: 'token-1', attachedTo: 'card-host' }),
    );

    const snapshot = exportSession(yDoc, ROOM);

    const boardIds = new Set(snapshot.board.map((c) => c.id));
    expect(snapshot.tokens[0].attachedTo).toBe('card-host');
    expect(boardIds.has(snapshot.tokens[0].attachedTo!)).toBe(true);
  });

  it('flags MTG token cards so import resolves them by id, not by name', () => {
    // A name lookup for "Treasure" can return a real card instead of the token.
    const { yDoc } = seedGame({
      playerId: 'alice',
      hand: [makeCard({ id: 'token-abc', name: 'Treasure', scryfallId: 'sf-treasure' })],
    });

    const [card] = exportSession(yDoc, ROOM).seats[0].zones.hand;

    expect(card.isToken).toBe(true);
  });

  it('omits a removed seat, whose map lingers in the doc', () => {
    const { yDoc } = seedGame({ playerId: 'alice' });
    new Player('kicked', yDoc);

    removePlayer(yDoc, 'kicked', 'alice');

    expect(exportSession(yDoc, ROOM).seats.map((s) => s.seatId)).toEqual(['alice']);
  });

  it('carries per-seat state the game would otherwise lose', () => {
    const { yDoc, player } = seedGame({ playerId: 'alice' });
    player.yPlayerState.set(YSTATE_HEALTH, 27);

    const [seat] = exportSession(yDoc, ROOM).seats;

    expect(seat.health).toBe(27);
    expect(seat.joinedAt).toBeGreaterThan(0);
    expect(seat.color).not.toBe('');
  });

  it('caps the action log so an old room does not bloat the file', () => {
    const { yDoc } = seedGame({ playerId: 'alice' });
    const log = yDoc.getArray(YDOC_ACTION_LOG);
    log.push(
      Array.from({ length: 250 }, (_, i) => ({
        id: `entry-${i}`,
        actorId: 'alice',
        type: 'draw',
        text: `drew a card (${i})`,
        ts: i,
      })),
    );

    const exported = exportSession(yDoc, ROOM).actionLog;

    expect(exported).toHaveLength(100);
    // The tail, not the head — recent history is the useful part.
    expect(exported[exported.length - 1].id).toBe('entry-249');
  });

  it('never writes to the doc it is exporting', () => {
    const { yDoc } = seedGame({ playerId: 'alice', hand: [makeCard()] });
    let wrote = false;
    yDoc.on('update', () => { wrote = true; });

    exportSession(yDoc, ROOM);

    expect(wrote).toBe(false);
  });

  it('exports an empty doc without throwing', () => {
    const snapshot = exportSession(new Y.Doc(), ROOM);

    expect(snapshot.seats).toEqual([]);
    expect(snapshot.board).toEqual([]);
    expect(countSnapshotCards(snapshot)).toBe(0);
  });

  it('counts every card across zones and board for the import preview', () => {
    const { yDoc } = seedGame({ playerId: 'alice', deck: makeCards(4), hand: makeCards(2) });
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('card-b', makeCard({ id: 'card-b' }));

    expect(countSnapshotCards(exportSession(yDoc, ROOM))).toBe(7);
  });
});
