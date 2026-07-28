import { describe, it, expect, vi } from 'vitest';
import { startImport, isResumeLink } from './startImport';
import { takePendingImport, hasPendingImport } from './pendingImport';
import { getSeatAlias, resolvePlayerIdForRoom } from '@/infrastructure/networking';
import { readVisitedRooms } from '@/features/room/RoomManager';
import { SESSION_SCHEMA_VERSION, emptyZones, type SessionSnapshot } from './sessionSnapshot';

const snapshot: SessionSnapshot = {
  schemaVersion: SESSION_SCHEMA_VERSION,
  exportedAt: 1_700_000_000_000,
  roomName: 'mtg-original',
  seats: [
    { seatId: 'alice', name: 'Alice', color: '#f00', joinedAt: 1, health: 40,
      customCounters: [], deckRevealCount: 0, allowViewHand: false, zones: emptyZones() },
    { seatId: 'bob', name: 'Bob', color: '#00f', joinedAt: 2, health: 40,
      customCounters: [], deckRevealCount: 0, allowViewHand: false, zones: emptyZones() },
  ],
  board: [],
  tokens: [],
  actionLog: [],
};

const start = (seatId = 'alice', roomName = 'mtg-restored') => {
  const navigate = vi.fn();
  const room = startImport(snapshot, seatId, { roomName, navigate });
  return { navigate, room };
};

describe('startImport', () => {
  it('restores into a brand new room, never the one it was exported from', () => {
    const { room } = start();

    // The original room's doc may still be live on another device; rejoining it
    // would merge two divergent histories rather than restoring one.
    expect(room).not.toBe(snapshot.roomName);
  });

  it('binds this device to the chosen seat', () => {
    start('bob');

    expect(getSeatAlias('mtg-restored')).toBe('bob');
    expect(resolvePlayerIdForRoom('mtg-restored')).toBe('bob');
  });

  it('leaves the other seats unclaimed for whoever opens the link', () => {
    start('alice');

    // Nothing binds this device to Bob; the picker offers it to the next player.
    expect(getSeatAlias('mtg-restored')).not.toBe('bob');
  });

  it('marks the room visited, so auto-load cannot reset the restored game', () => {
    // autoLoadDeckOnStart treats an unvisited room as new and calls
    // player.reset() on it — which would wipe the import moments after it lands.
    start();

    expect(readVisitedRooms()).toContain('mtg-restored');
  });

  it('parks the snapshot under the new room for the next boot to apply', () => {
    start();

    expect(takePendingImport('mtg-restored')).toEqual(snapshot);
  });

  it('navigates to the new room flagged as a resume link', () => {
    const { navigate } = start();

    const url = navigate.mock.calls[0][0] as string;
    expect(new URLSearchParams(url).get('room')).toBe('mtg-restored');
    expect(isResumeLink(url)).toBe(true);
  });

  it('does not navigate when the snapshot could not be parked', () => {
    // Better to fail loudly on the page the user is standing on than to land
    // them in an empty room whose game never arrives.
    const setItem = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const navigate = vi.fn();

    try {
      expect(() => startImport(snapshot, 'alice', { roomName: 'mtg-full', navigate })).toThrow();
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('isResumeLink', () => {
  it('recognises a restored-game link', () => {
    expect(isResumeLink('?room=mtg-abc&resume=1')).toBe(true);
  });

  it('leaves an ordinary room link alone', () => {
    expect(isResumeLink('?room=mtg-abc')).toBe(false);
    expect(isResumeLink('')).toBe(false);
  });
});

describe('pendingImport', () => {
  it('reports a parked snapshot before it is taken', () => {
    start();

    expect(hasPendingImport('mtg-restored')).toBe(true);
  });

  it('is consumed on read, so a failed import fails once rather than forever', () => {
    start();

    expect(takePendingImport('mtg-restored')).not.toBeNull();
    expect(takePendingImport('mtg-restored')).toBeNull();
  });

  it('is scoped to its room', () => {
    start();

    expect(takePendingImport('mtg-someone-elses-room')).toBeNull();
  });

  it('discards an unreadable snapshot rather than throwing on boot', () => {
    sessionStorage.setItem('aura:pending-import:mtg-corrupt', 'not json{');

    expect(takePendingImport('mtg-corrupt')).toBeNull();
  });
});
