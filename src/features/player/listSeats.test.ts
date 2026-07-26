import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { listSeats } from './listSeats';
import { YDOC_PLAYER, YSTATE_JOINED_AT, YSTATE_REMOVED } from '@/constants';

/** Seat a player in the doc the way `Player`'s constructor does. */
function seat(yDoc: Y.Doc, playerId: string, joinedAt: number): Y.Map<any> {
  const map = yDoc.getMap(YDOC_PLAYER(playerId));
  map.set(YSTATE_JOINED_AT, joinedAt);
  return map;
}

describe('listSeats', () => {
  it('returns every seated player', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'alice', 1000);
    seat(yDoc, 'bob', 2000);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['alice', 'bob']);
  });

  it('orders by joinedAt so every peer computes the same seat index', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'later', 5000);
    seat(yDoc, 'earlier', 1000);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['earlier', 'later']);
  });

  it('breaks a joinedAt tie by player id, so the order is total', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'zoe', 1000);
    seat(yDoc, 'adam', 1000);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['adam', 'zoe']);
  });

  it('omits removed seats, whose maps linger in the doc forever', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'alice', 1000);
    seat(yDoc, 'kicked', 2000).set(YSTATE_REMOVED, true);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['alice']);
  });

  it('ignores non-player top-level maps sharing the doc', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'alice', 1000);
    yDoc.getMap('cards-on-board').set('card-1', { id: 'card-1' });
    yDoc.getArray('action-log').push([{ id: 'entry-1' }]);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['alice']);
  });

  it('treats a seat with no joinedAt as the oldest rather than dropping it', () => {
    const yDoc = new Y.Doc();
    yDoc.getMap(YDOC_PLAYER('legacy')); // predates the joinedAt stamp
    seat(yDoc, 'alice', 1000);

    expect(listSeats(yDoc).map((s) => s.playerId)).toEqual(['legacy', 'alice']);
  });

  it('hands back the live map, not a copy', () => {
    const yDoc = new Y.Doc();
    seat(yDoc, 'alice', 1000);

    listSeats(yDoc)[0].map.set('health', 33);

    expect(yDoc.getMap(YDOC_PLAYER('alice')).get('health')).toBe(33);
  });

  it('returns nothing for a doc with no players', () => {
    expect(listSeats(new Y.Doc())).toEqual([]);
  });
});
