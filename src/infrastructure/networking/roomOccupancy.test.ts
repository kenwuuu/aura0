import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { countPlayersInRoom, watchRoomOccupancy } from './roomOccupancy';

/** Injects a remote peer's awareness state, the same wire mechanism every real provider uses. */
function joinRemotePlayer(target: Awareness, playerId: string): Awareness {
  const remote = new Awareness(new Y.Doc());
  remote.setLocalStateField('playerId', playerId);
  applyAwarenessUpdate(target, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
  return remote;
}

/** Simulates that peer disconnecting. */
function leaveRemotePlayer(target: Awareness, remote: Awareness): void {
  remote.setLocalState(null);
  applyAwarenessUpdate(target, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
}

describe('countPlayersInRoom', () => {
  it('does not count a client before it has set a playerId', () => {
    const awareness = new Awareness(new Y.Doc());
    expect(countPlayersInRoom(awareness)).toBe(0);
  });

  it('counts the local client once it sets playerId', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalStateField('playerId', 'player-1');
    expect(countPlayersInRoom(awareness)).toBe(1);
  });

  it('counts remote players once their state syncs in', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalStateField('playerId', 'player-1');
    joinRemotePlayer(awareness, 'player-2');
    expect(countPlayersInRoom(awareness)).toBe(2);
  });

  it('does not count a remote client with awareness state but no playerId (e.g. cursor-only)', () => {
    const awareness = new Awareness(new Y.Doc());
    const remote = new Awareness(new Y.Doc());
    remote.setLocalStateField('cursor', { x: 0, y: 0 });
    applyAwarenessUpdate(awareness, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
    expect(countPlayersInRoom(awareness)).toBe(0);
  });
});

describe('watchRoomOccupancy', () => {
  it('reports the initial count immediately', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalStateField('playerId', 'player-1');
    const onCountChange = vi.fn();

    watchRoomOccupancy(awareness, onCountChange);

    expect(onCountChange).toHaveBeenCalledTimes(1);
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  it('reports again only when the count actually changes', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalStateField('playerId', 'player-1');
    const onCountChange = vi.fn();
    watchRoomOccupancy(awareness, onCountChange);
    onCountChange.mockClear();

    // Unrelated field update on the same (already-counted) client: no count change.
    awareness.setLocalStateField('cursor', { x: 1, y: 1 });
    expect(onCountChange).not.toHaveBeenCalled();

    // A peer joins: count changes 1 -> 2.
    const remote = joinRemotePlayer(awareness, 'player-2');
    expect(onCountChange).toHaveBeenCalledTimes(1);
    expect(onCountChange).toHaveBeenLastCalledWith(2);

    // That peer leaves: count changes 2 -> 1.
    leaveRemotePlayer(awareness, remote);
    expect(onCountChange).toHaveBeenCalledTimes(2);
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });

  it('stops reporting after unsubscribe', () => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalStateField('playerId', 'player-1');
    const onCountChange = vi.fn();
    const unsubscribe = watchRoomOccupancy(awareness, onCountChange);
    onCountChange.mockClear();

    unsubscribe();
    joinRemotePlayer(awareness, 'player-2');

    expect(onCountChange).not.toHaveBeenCalled();
  });
});
