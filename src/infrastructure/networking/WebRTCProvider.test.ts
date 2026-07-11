/**
 * Unit tests for the WebRTCProvider signaling monitor.
 *
 * WebRTC has no single connection status — y-webrtc keeps an array of signaling
 * sockets, and `provider.connected` does not reflect their reachability. These
 * tests drive the shared ConnectionMonitor off those signaling sockets: an
 * initial load whose signaling never connects, recovery, per-episode outcomes,
 * and that a destroyed provider stops watching the (pooled) sockets. The real
 * I/O boundaries (y-webrtc, IndexedDB, Sentry, PostHog) are mocked; the CRDT
 * doc is real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';

const h = vi.hoisted(() => {
  const captureMessage = vi.fn();
  const posthogCapture = vi.fn();
  const rtcInstances: FakeWebrtc[] = [];

  // A single signaling socket (lib0 WebsocketClient stand-in).
  class FakeConn {
    connected = false;
    private handlers: Record<string, Array<() => void>> = {};
    on(event: string, fn: () => void): void {
      (this.handlers[event] ??= []).push(fn);
    }
    off(event: string, fn: () => void): void {
      this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
    }
    private emit(event: string): void {
      (this.handlers[event] ?? []).forEach((fn) => fn());
    }
    open(): void {
      this.connected = true;
      this.emit('connect');
    }
    drop(): void {
      this.connected = false;
      this.emit('disconnect');
    }
  }

  class FakeWebrtc {
    connected = false;
    peerId?: string;
    awareness = { getLocalState: () => null, setLocalState: () => {} };
    signalingConns: FakeConn[];
    private handlers: Record<string, Array<(e: unknown) => void>> = {};

    constructor(
      public room: string,
      public doc: unknown,
      opts: { signaling?: string[] },
    ) {
      // One signaling socket per URL, initially not connected — matching
      // y-webrtc, which populates signalingConns at construction.
      this.signalingConns = (opts.signaling ?? ['wss://sig']).map(() => new FakeConn());
      rtcInstances.push(this);
    }

    on(event: string, fn: (e: unknown) => void): void {
      (this.handlers[event] ??= []).push(fn);
    }
    off(event: string, fn: (e: unknown) => void): void {
      this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
    }
    private emit(event: string, payload: unknown): void {
      (this.handlers[event] ?? []).forEach((fn) => fn(payload));
    }
    destroy(): void {}

    /** Simulate y-webrtc's 'peers' event (the live peer-id list). */
    peers(webrtcPeers: string[]): void {
      this.emit('peers', { webrtcPeers });
    }
    /** Simulate y-webrtc's 'synced' event. */
    syncDoc(state: boolean): void {
      this.emit('synced', { synced: state });
    }
  }

  return { captureMessage, posthogCapture, rtcInstances, FakeWebrtc };
});

vi.mock('y-webrtc', () => ({ WebrtcProvider: h.FakeWebrtc }));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    whenSynced = Promise.resolve();
    destroy(): void {}
  },
}));
vi.mock('@sentry/browser', () => ({ captureMessage: h.captureMessage }));
vi.mock('posthog-js', () => ({ default: { capture: h.posthogCapture } }));

import { WebRTCProvider } from './WebRTCProvider';

const GRACE_MS = 3000;

function latestProvider(): InstanceType<typeof h.FakeWebrtc> {
  const p = h.rtcInstances[h.rtcInstances.length - 1];
  if (!p) throw new Error('no provider was constructed');
  return p;
}

describe('WebRTCProvider signaling monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.rtcInstances.length = 0;
    h.captureMessage.mockClear();
    h.posthogCapture.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports to Sentry when signaling is unreachable on initial load', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(h.captureMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    expect(h.captureMessage).toHaveBeenCalledWith(
      'WebRTC signaling unreachable',
      expect.objectContaining({ level: 'error', tags: { transport: 'webrtc' } }),
    );
  });

  it('does not report when a signaling socket connects within the grace period', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    latestProvider().signalingConns[0].open();

    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it('records one PostHog outcome per episode, tagged webrtc', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    const conn = latestProvider().signalingConns[0];

    // Signaling never comes up on load → one 'failed' outcome.
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.posthogCapture).toHaveBeenCalledTimes(1);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'webrtc', outcome: 'failed' }),
    );

    // Signaling comes up → one 'connected' outcome with time-to-connect.
    conn.open();
    expect(h.posthogCapture).toHaveBeenCalledTimes(2);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'webrtc', outcome: 'connected', connect_ms: expect.any(Number) }),
    );

    // Signaling drops and stays down → a fresh episode reports again (this is
    // the second Sentry report: one on load, one after this drop).
    conn.drop();
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(2);
    expect(h.posthogCapture).toHaveBeenCalledTimes(3);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'webrtc', outcome: 'failed' }),
    );
  });

  it('treats any signaling socket being up as reachable', () => {
    // Two signaling servers: reachability is the OR of the sockets, so one up
    // is enough and no failure should be reported.
    new WebRTCProvider(new Y.Doc(), {
      roomName: 'room-1',
      signalingServers: ['wss://a', 'wss://b'],
    });
    latestProvider().signalingConns[1].open();

    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it('stops watching the pooled sockets after destroy', () => {
    const provider = new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    const conn = latestProvider().signalingConns[0];
    provider.destroy();

    // A pooled socket can keep emitting after this provider is gone; it must not
    // re-arm the monitor or report.
    conn.drop();
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });
});

describe('WebRTCProvider sync monitor', () => {
  const SYNC_GRACE_MS = 8000;

  beforeEach(() => {
    vi.useFakeTimers();
    h.rtcInstances.length = 0;
    h.captureMessage.mockClear();
    h.posthogCapture.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function syncOutcomeCalls() {
    return h.posthogCapture.mock.calls.filter(([event]) => event === 'sync_outcome');
  }

  it('never arms while alone in the room (no peers, no report)', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });

    vi.advanceTimersByTime(SYNC_GRACE_MS * 2);
    expect(syncOutcomeCalls()).toHaveLength(0);
  });

  it('reports a synced outcome, carrying peer count, once a peer appears and the doc syncs', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    const provider = latestProvider();
    provider.peers(['peer-a']);
    provider.syncDoc(true);

    expect(syncOutcomeCalls()).toHaveLength(1);
    expect(syncOutcomeCalls()[0][1]).toMatchObject({
      transport: 'webrtc',
      outcome: 'synced',
      episode_id: expect.any(String),
      sync_ms: expect.any(Number),
      peer_count: 1,
    });
  });

  it('reports a sync timeout if a peer appears but the doc never syncs', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    latestProvider().peers(['peer-a']);

    vi.advanceTimersByTime(SYNC_GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledWith(
      'WebRTC peer sync timed out',
      expect.objectContaining({ level: 'error', tags: { transport: 'webrtc' } }),
    );
    expect(syncOutcomeCalls()).toHaveLength(1);
    expect(syncOutcomeCalls()[0][1]).toMatchObject({ transport: 'webrtc', outcome: 'timed_out' });
  });

  it('does not report a timeout if the peer disappears before syncing', () => {
    new WebRTCProvider(new Y.Doc(), { roomName: 'room-1' });
    const provider = latestProvider();
    provider.peers(['peer-a']);
    provider.peers([]);

    vi.advanceTimersByTime(SYNC_GRACE_MS * 2);
    expect(syncOutcomeCalls()).toHaveLength(0);
  });
});
