import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from 'y-protocols/awareness';
import { removePlayer, isPlayerOnline, getDepartedPlayers } from './removePlayer';
import { Player } from './Player';
import { getActionLog } from '@/features/action-log/actionLog';
import {
  YDOC_PLAYER,
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
  YSTATE_REMOVED,
  YSTATE_HEALTH,
  YSTATE_JOINED_AT,
  YSTATE_PLAYER_NAME,
} from '@/constants';

/** Seed a minimal player seat in the doc. */
function seatPlayer(yDoc: Y.Doc, playerId: string, name = `Name-${playerId}`): void {
  const map = yDoc.getMap(YDOC_PLAYER(playerId));
  map.set(YSTATE_JOINED_AT, Date.now());
  map.set(YSTATE_HEALTH, 40);
  map.set(YSTATE_PLAYER_NAME, name);
}

function putCard(yDoc: Y.Doc, id: string, ownerId: string): void {
  yDoc.getMap(YDOC_CARDS_ON_BOARD).set(id, { id, ownerId, name: 'Bolt' });
}

function putToken(yDoc: Y.Doc, id: string, ownerId: string): void {
  yDoc.getMap(YDOC_KEYWORD_TOKENS).set(id, { id, ownerId, title: 'Flying' });
}

/** Build an Awareness whose live clients are exactly `onlineIds`. Each extra id
 *  is merged in from a throwaway doc so it gets a distinct clientID. */
function awarenessWithOnline(yDoc: Y.Doc, onlineIds: string[]): Awareness {
  const aw = new Awareness(yDoc);
  if (onlineIds.length > 0) aw.setLocalStateField('playerId', onlineIds[0]);
  onlineIds.slice(1).forEach((id) => {
    const remote = new Awareness(new Y.Doc());
    remote.setLocalStateField('playerId', id);
    applyAwarenessUpdate(aw, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
  });
  return aw;
}

describe('removePlayer', () => {
  let yDoc: Y.Doc;

  beforeEach(() => {
    yDoc = new Y.Doc();
  });

  it('tombstones the seat and clears its contents', () => {
    seatPlayer(yDoc, 'gone');

    removePlayer(yDoc, 'gone', 'me');

    const map = yDoc.getMap(YDOC_PLAYER('gone'));
    expect(map.get(YSTATE_REMOVED)).toBe(true);
    // Everything else is cleared.
    expect(map.get(YSTATE_HEALTH)).toBeUndefined();
    expect(map.get(YSTATE_JOINED_AT)).toBeUndefined();
    expect(map.get(YSTATE_PLAYER_NAME)).toBeUndefined();
  });

  it("deletes the removed player's board cards and tokens, leaving others' alone", () => {
    seatPlayer(yDoc, 'gone');
    putCard(yDoc, 'c-gone', 'gone');
    putCard(yDoc, 'c-mine', 'me');
    putToken(yDoc, 't-gone', 'gone');
    putToken(yDoc, 't-mine', 'me');

    removePlayer(yDoc, 'gone', 'me');

    const cards = yDoc.getMap(YDOC_CARDS_ON_BOARD);
    const tokens = yDoc.getMap(YDOC_KEYWORD_TOKENS);
    expect(cards.has('c-gone')).toBe(false);
    expect(cards.has('c-mine')).toBe(true);
    expect(tokens.has('t-gone')).toBe(false);
    expect(tokens.has('t-mine')).toBe(true);
  });

  it('logs a remove_player entry naming the departed player', () => {
    seatPlayer(yDoc, 'gone', 'Departed Dan');

    removePlayer(yDoc, 'gone', 'me');

    const log = getActionLog(yDoc).toArray();
    const entry = log.find((e) => e.type === 'remove_player');
    expect(entry).toBeDefined();
    expect(entry!.actorId).toBe('me');
    expect(entry!.text).toBe('removed Departed Dan from the game');
  });

  it('is a no-op when asked to remove the actor themselves', () => {
    seatPlayer(yDoc, 'me');

    removePlayer(yDoc, 'me', 'me');

    expect(yDoc.getMap(YDOC_PLAYER('me')).get(YSTATE_REMOVED)).toBeUndefined();
    expect(yDoc.getMap(YDOC_PLAYER('me')).get(YSTATE_HEALTH)).toBe(40);
  });

  it('is undone (as a kick, not a ban) when the removed player rejoins', () => {
    seatPlayer(yDoc, 'gone');
    removePlayer(yDoc, 'gone', 'me');
    expect(yDoc.getMap(YDOC_PLAYER('gone')).get(YSTATE_REMOVED)).toBe(true);

    // Reopening the room re-constructs their Player, which clears the tombstone
    // and re-seeds a fresh seat.
    new Player('gone', yDoc, [], { initialHealth: 40 });

    const map = yDoc.getMap(YDOC_PLAYER('gone'));
    expect(map.get(YSTATE_REMOVED)).toBeUndefined();
    expect(map.get(YSTATE_HEALTH)).toBe(40);
    expect(map.get(YSTATE_JOINED_AT)).toBeDefined();
  });
});

describe('isPlayerOnline', () => {
  it('reflects whether a playerId is present in awareness', () => {
    const yDoc = new Y.Doc();
    const aw = awarenessWithOnline(yDoc, ['a', 'b']);

    expect(isPlayerOnline(aw, 'a')).toBe(true);
    expect(isPlayerOnline(aw, 'b')).toBe(true);
    expect(isPlayerOnline(aw, 'c')).toBe(false);
  });
});

describe('getDepartedPlayers', () => {
  it('returns seated players who are offline, excluding local, online, and removed', () => {
    const yDoc = new Y.Doc();
    seatPlayer(yDoc, 'me', 'Me');
    seatPlayer(yDoc, 'online-opp', 'Online');
    seatPlayer(yDoc, 'offline-opp', 'Offline');
    seatPlayer(yDoc, 'kicked', 'Kicked');
    removePlayer(yDoc, 'kicked', 'me'); // already tombstoned

    // Live clients: me + the online opponent.
    const aw = awarenessWithOnline(yDoc, ['me', 'online-opp']);

    const departed = getDepartedPlayers(yDoc, aw, 'me');

    expect(departed).toEqual([{ playerId: 'offline-opp', name: 'Offline' }]);
  });

  it('returns an empty list when everyone seated is online', () => {
    const yDoc = new Y.Doc();
    seatPlayer(yDoc, 'me');
    seatPlayer(yDoc, 'opp');
    const aw = awarenessWithOnline(yDoc, ['me', 'opp']);

    expect(getDepartedPlayers(yDoc, aw, 'me')).toEqual([]);
  });
});
