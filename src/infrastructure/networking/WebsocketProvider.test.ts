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
    latestSocket().connect();

    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it('records one PostHog outcome per episode for both success and failure', () => {
    new WebsocketProvider(new Y.Doc(), { roomName: 'room-1' });
    const ws = latestSocket();

    // Fails to connect on load → one 'failed' outcome (Sentry + PostHog).
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(1);
    expect(h.posthogCapture).toHaveBeenCalledTimes(1);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'websocket', outcome: 'failed' }),
    );

    // Recovers → one 'connected' outcome, carrying the time-to-connect.
    ws.connect();
    expect(h.posthogCapture).toHaveBeenCalledTimes(2);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'websocket', outcome: 'connected', connect_ms: expect.any(Number) }),
    );

    // A later drop that stays down is a fresh episode → reports again.
    ws.drop();
    vi.advanceTimersByTime(GRACE_MS);
    expect(h.captureMessage).toHaveBeenCalledTimes(2);
    expect(h.posthogCapture).toHaveBeenCalledTimes(3);
    expect(h.posthogCapture).toHaveBeenLastCalledWith(
      'connection_outcome',
      expect.objectContaining({ transport: 'websocket', outcome: 'failed' }),
    );
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
