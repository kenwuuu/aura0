/**
 * Unit tests for the WebsocketProvider connection monitor.
 *
 * These exercise the grace-period state machine that decides when an
 * unreachable relay is worth flagging — reporting the failure to Sentry and
 * feeding both outcomes (connected / failed) to PostHog so the failure rate has
 * a denominator. The real I/O boundaries (the y-websocket socket, IndexedDB
 * persistence, Sentry, PostHog) are mocked; the CRDT doc is real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';

// Controllable fakes shared between the module mocks and the tests.
const h = vi.hoisted(() => {
  const captureMessage = vi.fn();
  const posthogCapture = vi.fn();
  const wsInstances: FakeWs[] = [];

  class FakeWs {
    wsconnected = false;
    peerId?: string;
    awareness = { getLocalState: () => null, setLocalState: () => {} };
    private handlers: Record<string, Array<(e: unknown) => void>> = {};

    constructor(
      public url: string,
      public room: string,
      public doc: unknown,
    ) {
      wsInstances.push(this);
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

    /** Simulate the relay accepting the connection. */
    connect(): void {
      this.wsconnected = true;
      this.emit('status', { status: 'connected' });
    }
    /** Simulate the socket dropping / a failed connection attempt. */
    drop(): void {
      this.wsconnected = false;
      this.emit('status', { status: 'disconnected' });
    }
    /**
     * Simulate y-websocket opening a fresh socket: setupWS() emits 'connecting'
     * once per attempt. Note the real client emits its *first* one from inside
     * its own constructor, before we can subscribe — so, as in production, only
     * retries surface here.
     */
    beginAttempt(): void {
      this.emit('status', { status: 'connecting' });
    }
    /** Simulate the relay's own 'sync' event (y-websocket emits a raw boolean). */
    syncDoc(state: boolean): void {
      this.emit('sync', state);
    }
  }

  return { captureMessage, posthogCapture, wsInstances, FakeWs };
});

vi.mock('y-websocket', () => ({ WebsocketProvider: h.FakeWs }));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    whenSynced = Promise.resolve();
    destroy(): void {}
  },
}));
vi.mock('@sentry/browser', () => ({ captureMessage: h.captureMessage }));
vi.mock('posthog-js', () => ({ default: { capture: h.posthogCapture } }));

import { WebsocketProvider } from './WebsocketProvider';

const GRACE_MS = 3000;

function latestSocket(): InstanceType<typeof h.FakeWs> {
  const ws = h.wsInstances[h.wsInstances.length - 1];
  if (!ws) throw new Error('no socket was constructed');
  return ws;
}

describe('WebsocketProvider connection monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.wsInstances.length = 0;
    h.captureMessage.mockClear();
    h.posthogCapture.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports to Sentry when the relay is unreachable on initial load', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });

    // Still within the grace period — nothing reported yet.
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(h.captureMessage).not.toHaveBeenCalled();

    // Grace period elapses with no connection: this is the "opened the site,
    // can't reach the server" case, not a mid-session drop.
    vi.advanceTimersByTime(1);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    expect(h.captureMessage).toHaveBeenCalledWith(
      'WebSocket relay unreachable',
      expect.objectContaining({ level: 'error' }),
    );
  });

  it('does not report when the relay connects within the grace period', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true); // otherwise the sync monitor's own grace period fires below

    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it('emits a single connected outcome for a fast initial connect, and no failure', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();

    expect(h.posthogCapture).toHaveBeenCalledTimes(1);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({
        transport: 'websocket',
        outcome: 'connected',
        episode_type: 'initial',
        episode_id: expect.any(String),
        connect_ms: expect.any(Number),
      }),
    );
    ws.syncDoc(true); // otherwise the sync monitor's own grace period fires below

    // Past the grace period, still connected → nothing further reported.
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
    expect(h.posthogCapture).toHaveBeenCalledTimes(2);
  });

  it('links an episode failure and its recovery by episode_id, then starts a fresh episode', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();

    // Fails to connect on load → one 'failed' outcome (Sentry + PostHog) tagged
    // as the initial episode.
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    expect(h.posthogCapture).toHaveBeenCalledTimes(1);
    const failedProps = h.posthogCapture.mock.calls[0][1] as Record<string, unknown>;
    expect(failedProps).toMatchObject({ transport: 'websocket', outcome: 'failed', episode_type: 'initial' });
    expect(failedProps.episode_id).toEqual(expect.any(String));

    // Recovers → 'connected' carrying the SAME episode_id: a slow-but-successful
    // initial connect, which analytics must not count as a hard failure.
    ws.connect();
    expect(h.posthogCapture).toHaveBeenCalledTimes(2);
    const connectedProps = h.posthogCapture.mock.calls[1][1] as Record<string, unknown>;
    expect(connectedProps).toMatchObject({
      transport: 'websocket',
      outcome: 'connected',
      episode_type: 'initial',
      connect_ms: expect.any(Number),
    });
    expect(connectedProps.episode_id).toBe(failedProps.episode_id);

    // A later drop that stays down is a fresh episode: new id, now a reconnect.
    ws.drop();
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(2);
    expect(h.posthogCapture).toHaveBeenCalledTimes(3);
    const reconnectFailedProps = h.posthogCapture.mock.calls[2][1] as Record<string, unknown>;
    expect(reconnectFailedProps).toMatchObject({ transport: 'websocket', outcome: 'failed', episode_type: 'reconnect' });
    expect(reconnectFailedProps.episode_id).not.toBe(failedProps.episode_id);
  });

  it('times the attempt that succeeded, not the outage before it', () => {
    // The laptop-sleep case, which is what made connect_ms useless: the socket
    // drops as the machine suspends, JS is frozen for three days, then the tab
    // wakes, retries, and the handshake completes in 300ms. That is a 300ms
    // connect after a three-day absence — not a three-day connect.
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    h.posthogCapture.mockClear();

    ws.drop();
    vi.advanceTimersByTime(THREE_DAYS); // suspended: no attempts happen in here
    ws.beginAttempt();                  // wakes and opens a fresh socket
    vi.advanceTimersByTime(300);
    ws.connect();

    const connected = h.posthogCapture.mock.calls.find(
      ([event, props]) =>
        event === 'connection_outcome'
        && (props as Record<string, unknown>).outcome === 'connected',
    );
    expect(connected?.[1]).toMatchObject({
      episode_type: 'reconnect',
      connect_ms: 300,
      offline_for_ms: THREE_DAYS + 300,
    });
  });

  it('reports how much of the outage the user actually watched', () => {
    // Board on screen the whole way down, so outage and witnessed time match.
    // VisibilityTracker.test.ts covers the cases where they come apart.
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    h.posthogCapture.mockClear();

    ws.drop();
    vi.advanceTimersByTime(45_000);
    ws.beginAttempt();
    vi.advanceTimersByTime(200);
    ws.connect();

    const connected = h.posthogCapture.mock.calls.find(
      ([event, props]) =>
        event === 'connection_outcome'
        && (props as Record<string, unknown>).outcome === 'connected',
    );
    expect(connected?.[1]).toMatchObject({
      offline_for_ms: 45_200,
      visible_for_ms: 45_200,
    });
  });

  it('restamps the clock on each retry, so only the winning attempt is timed', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    h.posthogCapture.mockClear();

    ws.drop();
    ws.beginAttempt();          // first attempt…
    vi.advanceTimersByTime(5000);
    ws.drop();                  // …which fails after 5s
    ws.beginAttempt();          // second attempt, the one that lands
    vi.advanceTimersByTime(120);
    ws.connect();

    const connected = h.posthogCapture.mock.calls.find(
      ([event, props]) =>
        event === 'connection_outcome'
        && (props as Record<string, unknown>).outcome === 'connected',
    );
    expect(connected?.[1]).toMatchObject({
      connect_ms: 120,
      offline_for_ms: 5120,
    });
  });

  it('falls back to timing the whole episode when no attempt is reported', () => {
    // y-webrtc has no 'connecting' edge, and y-websocket emits its first one from
    // inside its own constructor, before we subscribe. Both land here, and both
    // are safe: an initial connect happens on an awake tab, so the episode clock
    // is not inflated by absence.
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    vi.advanceTimersByTime(750);
    ws.connect();

    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({
        episode_type: 'initial',
        connect_ms: 750,
        offline_for_ms: 750,
      }),
    );
  });

  it('ignores a repeat connected signal, keeping one outcome per episode', () => {
    // markConnected() early-returns when no episode is open. If that ever
    // regressed, a transport that re-announces 'connected' would inflate the
    // denominator and silently deflate every failure rate built on it.
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    h.posthogCapture.mockClear();

    ws.connect();

    expect(h.posthogCapture).not.toHaveBeenCalledWith(
      'connection_outcome',
      expect.anything(),
    );
  });

  it('opens a fresh episode if an attempt starts while we still believe we are connected', () => {
    // A transport announcing an attempt without having announced the drop first
    // is, in fact, down. markConnecting() arms the episode so the reconnect is
    // still counted rather than silently swallowed.
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    h.posthogCapture.mockClear();

    ws.beginAttempt(); // no drop() first
    vi.advanceTimersByTime(200);
    ws.connect();

    const connected = h.posthogCapture.mock.calls.find(
      ([event, props]) =>
        event === 'connection_outcome'
        && (props as Record<string, unknown>).outcome === 'connected',
    );
    expect(connected?.[1]).toMatchObject({
      episode_type: 'reconnect',
      connect_ms: 200,
      offline_for_ms: 200,
    });
    expect((connected?.[1] as Record<string, unknown>).episode_id).toEqual(expect.any(String));
  });

  it('reports the failure only once while the connection stays stuck', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();

    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);

    // Continued retry churn while still stuck must not re-report.
    ws.drop();
    ws.drop();
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('does not report after the provider is destroyed', () => {
    const provider = new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    provider.destroy();

    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });
});

describe('WebsocketProvider sync monitor', () => {
  const SYNC_GRACE_MS = 5000;

  beforeEach(() => {
    vi.useFakeTimers();
    h.wsInstances.length = 0;
    h.captureMessage.mockClear();
    h.posthogCapture.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function syncOutcomeCalls() {
    return h.posthogCapture.mock.calls.filter(([event]) => event === 'sync_outcome');
  }

  it('reports a synced outcome once the relay syncs after connecting', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);

    expect(syncOutcomeCalls()).toHaveLength(1);
    expect(syncOutcomeCalls()[0][1]).toMatchObject({
      transport: 'websocket',
      outcome: 'synced',
      episode_id: expect.any(String),
      sync_ms: expect.any(Number),
    });
  });

  it('reports a sync timeout if the relay connects but never syncs', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    latestSocket().connect();

    vi.advanceTimersByTime(SYNC_GRACE_MS - 1);
    expect(h.captureMessage).not.toHaveBeenCalledWith(
      'WebSocket relay sync timed out',
      expect.anything(),
    );

    vi.advanceTimersByTime(1);
    expect(h.captureMessage).toHaveBeenCalledWith(
      'WebSocket relay sync timed out',
      expect.objectContaining({ level: 'error' }),
    );
    expect(syncOutcomeCalls()).toHaveLength(1);
    expect(syncOutcomeCalls()[0][1]).toMatchObject({
      transport: 'websocket',
      outcome: 'timed_out',
      unsynced_for_ms: expect.any(Number),
    });
  });

  it('does not report a timeout if the relay disconnects before syncing', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.drop();

    vi.advanceTimersByTime(SYNC_GRACE_MS * 2);
    expect(syncOutcomeCalls()).toHaveLength(0);
  });

  it('starts a fresh sync episode on reconnect', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();
    ws.connect();
    ws.syncDoc(true);
    ws.drop();
    ws.connect();
    ws.syncDoc(true);

    expect(syncOutcomeCalls()).toHaveLength(2);
    const [first, second] = syncOutcomeCalls().map((call) => call[1] as { episode_id: string });
    expect(second.episode_id).not.toBe(first.episode_id);
  });
});
