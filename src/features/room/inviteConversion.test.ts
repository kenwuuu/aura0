import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import posthog from 'posthog-js';
import {
  noteRoomLinkCopied,
  resetInviteConversionForTests,
  watchInviteConversion,
} from './inviteConversion';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

/** Injects a remote peer's awareness state — the wire mechanism every real provider uses. */
function joinRemotePlayer(target: Awareness, playerId: string): Awareness {
  const remote = new Awareness(new Y.Doc());
  remote.setLocalStateField('playerId', playerId);
  applyAwarenessUpdate(target, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
  return remote;
}

function leaveRemotePlayer(target: Awareness, remote: Awareness): void {
  remote.setLocalState(null);
  applyAwarenessUpdate(target, encodeAwarenessUpdate(remote, [remote.clientID]), 'test');
}

function aloneInRoom(): Awareness {
  const awareness = new Awareness(new Y.Doc());
  awareness.setLocalStateField('playerId', 'me');
  return awareness;
}

const captured = () =>
  (posthog.capture as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'invite_converted');

describe('invite_converted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInviteConversionForTests();
  });

  it('fires when someone joins a room whose link the player shared', () => {
    const awareness = aloneInRoom();
    watchInviteConversion(awareness, () => 'mtg-abc123');

    noteRoomLinkCopied();
    joinRemotePlayer(awareness, 'friend');

    expect(captured()).toHaveLength(1);
    expect(captured()[0][1]).toMatchObject({ room: 'mtg-abc123', player_count: 2 });
  });

  it('does NOT fire when somebody joins a room the player never shared', () => {
    // A player who wandered into someone else's room, or whose friend found the
    // link some other way. Nothing was invited, so nothing converted.
    const awareness = aloneInRoom();
    watchInviteConversion(awareness, () => 'mtg-abc123');

    joinRemotePlayer(awareness, 'stranger');

    expect(captured()).toHaveLength(0);
  });

  it('does not fire on the count it is handed at subscribe time', () => {
    // `watchRoomOccupancy` reports the current count immediately on subscribe.
    // That first reading is a snapshot, not an arrival — nobody turned up.
    const awareness = aloneInRoom();
    joinRemotePlayer(awareness, 'friend');

    noteRoomLinkCopied();
    watchInviteConversion(awareness, () => 'mtg-abc123');

    expect(captured()).toHaveLength(0);
  });

  it('fires once, not once per arrival', () => {
    const awareness = aloneInRoom();
    watchInviteConversion(awareness, () => 'mtg-abc123');

    noteRoomLinkCopied();
    joinRemotePlayer(awareness, 'friend-1');
    joinRemotePlayer(awareness, 'friend-2');

    expect(captured()).toHaveLength(1);
  });

  it('does not count a peer LEAVING as an arrival', () => {
    // The one that catches a naive "are there 2+ people here?" check. In a
    // three-player room, somebody leaving drops the count to 2 — still "someone is
    // here", but nobody arrived, and no invite converted. Only an *increase* counts.
    const awareness = aloneInRoom();
    joinRemotePlayer(awareness, 'friend-1');
    const friend2 = joinRemotePlayer(awareness, 'friend-2');
    watchInviteConversion(awareness, () => 'mtg-abc123'); // subscribes at count 3

    noteRoomLinkCopied();
    leaveRemotePlayer(awareness, friend2); // 3 -> 2

    expect(captured()).toHaveLength(0);
  });

  it('reports how long the invite took to land', () => {
    const awareness = aloneInRoom();
    watchInviteConversion(awareness, () => 'mtg-abc123');

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    noteRoomLinkCopied();
    vi.spyOn(Date, 'now').mockReturnValue(1_045_000); // 45s later
    joinRemotePlayer(awareness, 'friend');

    expect(captured()[0][1]).toMatchObject({ seconds_since_copy: 45 });
  });
});
