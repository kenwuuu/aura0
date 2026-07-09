/**
 * Websocket Provider
 *
 * This module wraps y-websocket and y-indexeddb to provide:
 * - Websocket connections for real-time state sync
 * - Local IndexedDB persistence for offline-first experience
 * - Persistent peer identity across page reloads
 * - Awareness state restoration (user presence/metadata)
 *
 * ## How It Works
 *
 * 1. **Y.Doc (Yjs Document)**: Shared CRDT data structure that syncs between peers
 * 2. **Websocket Provider**: Establishes connections via central Websocket server
 * 3. **IndexedDB Persistence**: Stores Y.Doc locally for instant reload
 * 4. **Awareness**: Tracks which peers are online and their metadata
 *
 * ## Persistence Strategy
 *
 * - **Player ID**: Stored in localStorage, reused across sessions
 * - **Peer ID**: Stored in localStorage, prevents "new peer" on reload
 * - **Y.Doc state**: Stored in IndexedDB, instant restoration
 * - **Awareness**: Stored in localStorage, restored on load
 *
 * @see persistence.ts for session management utilities
 * @see types.ts for configuration interfaces
 */

import * as Y from 'yjs';
import * as Sentry from '@sentry/browser';
import { v4 as uuidv4 } from 'uuid';
import { WebsocketProvider as WsProvider } from "y-websocket";
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketConfig } from './types';
import { restoreAwarenessState, setupAwarenessStatePersistence, AwarenessState } from './persistence';
import {NetworkStatusEvent, YjsNetworkProvider} from "@/infrastructure/networking/YjsNetworkFactory";
import { trackWsConnectionOutcome } from '@/infrastructure/analytics/PosthogFunctions';

/**
 * How long the relay can stay unreachable before we stop calling it
 * "connecting" — at which point we both surface a real error to the user and
 * report it to Sentry. y-websocket retries with exponential backoff forever on
 * its own; this just decides when that background retrying has gone on long
 * enough to be worth flagging. A healthy connection resolves in well under a
 * second, so 3s is comfortably past "just slow" without being trigger-happy.
 */
const CONNECTION_ERROR_GRACE_PERIOD_MS = 3000;
const CONNECTION_ERROR_MESSAGE = "Can't reach the game server over WebSocket. Switch to WebRTC in Settings to keep playing.";

/** The relay every WebSocket-transport client connects to. */
const WS_SERVER_URL = 'wss://digitalocean-ws-ipv4.aura0.app';

/**
 * Main Websocket provider class that manages peer-to-peer connections
 * and document persistence
 */
export class WebsocketProvider implements YjsNetworkProvider{
  private yDoc: Y.Doc;
  private provider: WsProvider;
  private persistence: IndexeddbPersistence;
  private config: WebsocketConfig;
  private cleanupAwarenessPersistence?: () => void;
  private disconnectedSince: number | null = null;
  private connectionErrorReported = false;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  // Correlates the two events a single disconnected episode can emit — the
  // 'failed' fired at the grace mark and the 'connected' fired if it later
  // recovers — so analytics can tell a hard failure (failed only) from a
  // slow-but-successful connect (failed + connected sharing this id). Minted
  // when an episode begins, cleared when it connects.
  private episodeId: string | null = null;
  // Distinguishes the first connection of this client's life from every
  // reconnect after it, so initial-connect health and mid-session resilience
  // can be read separately rather than blended into one rate.
  private hasEverConnected = false;
  private readonly statusListeners = new Map<(event: NetworkStatusEvent) => void, (wsEvent: { status: string }) => void>();

  status(): string {
    return this.provider.wsconnected ? 'connected' : 'connecting';
  }

  /** Resolves once the Y.Doc has been restored from IndexedDB. */
  public whenSynced(): Promise<void> {
    return this.persistence.whenSynced.then(() => undefined);
  }

  public on(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    // The disconnected clock is owned by monitorConnection(); here we only
    // read it to decide whether the UI should still say "connecting" or has
    // waited long enough to show a real error.
    const wrapped = (wsEvent: { status: string }) => {
      if (wsEvent.status === 'connected') {
        callback({ status: 'connected' });
        return;
      }
      const stuck = this.disconnectedSince !== null
        && Date.now() - this.disconnectedSince > CONNECTION_ERROR_GRACE_PERIOD_MS;
      callback(stuck
        ? { status: 'error', message: CONNECTION_ERROR_MESSAGE }
        : { status: 'connecting' });
    };
    this.statusListeners.set(callback, wrapped);
    this.provider.on('status', wrapped);
  }

  public off(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    const wrapped = this.statusListeners.get(callback);
    if (wrapped) {
      this.provider.off('status', wrapped);
      this.statusListeners.delete(callback);
    }
  }

  constructor(yDoc: Y.Doc, config: WebsocketConfig) {
    this.yDoc = yDoc;
    this.config = {
      roomName: config.roomName,
      peerId: config.peerId,
    };

    // Set up IndexedDB persistence for the Y.Doc
    // This persists the document state locally so it survives page reloads
    this.persistence = new IndexeddbPersistence(this.config.roomName, this.yDoc);

    this.provider = new WsProvider(
      WS_SERVER_URL,
      config.roomName,
      yDoc,
    )

    // Set persistent peer ID if provided
    if (config.peerId) {
      // @ts-ignore - peerId is not officially exposed but can be set
      this.provider.peerId = config.peerId;
    }

    this.setupEventListeners();
    this.setupAwareness();
    this.monitorConnection();
  }

  /**
   * Watches the relay connection and reports to Sentry once if we can't reach
   * it within the grace period. Runs independently of any UI status listener,
   * and — because a fresh client starts life disconnected — covers both an
   * initial page load that never connects and a mid-session drop that stays
   * down. y-websocket keeps retrying underneath; this only decides when a
   * stuck connection has gone on long enough to be worth flagging.
   */
  private monitorConnection(): void {
    // Arm the clock immediately: at construction we are not yet connected, so
    // an initial load that never reaches the server is treated exactly like a
    // later drop rather than sitting silently in "connecting" forever.
    this.markDisconnected();
    this.provider.on('status', ({ status }: { status: string }) => {
      if (status === 'connected') {
        this.markConnected();
      } else {
        this.markDisconnected();
      }
    });
  }

  private markConnected(): void {
    // Only the disconnected→connected edge counts as one successful connection;
    // repeat 'connected' events (disconnectedSince already null) are ignored so
    // the analytics denominator stays one-per-episode, symmetric with failures.
    // connectMs measures that edge: construction→connect on first load, or
    // drop→reconnect thereafter — i.e. how long the user waited to be online.
    const connectMs = this.disconnectedSince === null
      ? undefined
      : Date.now() - this.disconnectedSince;
    const episodeId = this.episodeId;
    // Read the type before flipping the flag: a slow initial connect is still
    // an 'initial' outcome even though this call is what makes future connects
    // count as reconnects.
    const episodeType = this.hasEverConnected ? 'reconnect' : 'initial';
    this.disconnectedSince = null;
    this.episodeId = null;
    this.connectionErrorReported = false;
    this.hasEverConnected = true;
    if (this.stuckTimer !== null) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
    if (connectMs !== undefined && episodeId !== null) {
      trackWsConnectionOutcome({ outcome: 'connected', episodeId, episodeType, connectMs });
    }
  }

  private markDisconnected(): void {
    if (this.disconnectedSince !== null) return; // already counting down
    this.disconnectedSince = Date.now();
    this.episodeId = uuidv4();
    this.stuckTimer = setTimeout(() => {
      this.stuckTimer = null;
      this.reportConnectionError();
    }, CONNECTION_ERROR_GRACE_PERIOD_MS);
  }

  /**
   * Fires at most once per stuck episode (reset on the next successful
   * connect), so a flaky connection reports each distinct outage rather than
   * spamming Sentry on every retry.
   */
  private reportConnectionError(): void {
    if (this.connectionErrorReported || this.provider.wsconnected) return;
    this.connectionErrorReported = true;
    const unreachableForMs = this.disconnectedSince === null
      ? undefined
      : Date.now() - this.disconnectedSince;
    Sentry.captureMessage('WebSocket relay unreachable', {
      level: 'error',
      tags: { transport: 'websocket' },
      extra: {
        url: WS_SERVER_URL,
        roomName: this.config.roomName,
        unreachableForMs: unreachableForMs ?? null,
      },
    });
    // Same episode also feeds the PostHog failure/total proportion. It carries
    // the episode id so a later recovery ('connected' with the same id) can be
    // distinguished from a connection that truly never came back.
    trackWsConnectionOutcome({
      outcome: 'failed',
      episodeId: this.episodeId ?? undefined,
      episodeType: this.hasEverConnected ? 'reconnect' : 'initial',
      unreachableForMs,
    });
  }

  private setupEventListeners(): void {
    // Log when IndexedDB persistence is ready
    this.persistence.whenSynced.then(() => {
      console.log('Document loaded from IndexedDB');
    });
  }

  /**
   * Set up awareness state persistence and restoration
   */
  private setupAwareness(): void {
    const awareness = this.provider.awareness;

    // Restore previous awareness state if available
    const savedState = restoreAwarenessState();
    if (savedState) {
      awareness.setLocalState(savedState);
      console.log('Restored awareness state from previous session');
    }

    // Set up automatic persistence on page unload
    this.cleanupAwarenessPersistence = setupAwarenessStatePersistence(() => {
      return awareness.getLocalState() as AwarenessState | null;
    });
  }

  public getAwareness() {
    return this.provider.awareness;
  }

  public destroy(): void {
    // Clean up awareness persistence listener
    if (this.cleanupAwarenessPersistence) {
      this.cleanupAwarenessPersistence();
    }

    // Cancel any pending stuck-connection report so we don't fire after teardown
    if (this.stuckTimer !== null) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }

    this.persistence.destroy();
  }
}