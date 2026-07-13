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
import { WebsocketProvider as WsProvider } from "y-websocket";
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketConfig } from './types';
import { restoreAwarenessState, setupAwarenessStatePersistence, AwarenessState } from './persistence';
import {NetworkStatusEvent, YjsNetworkProvider} from "@/infrastructure/networking/YjsNetworkFactory";
import { ConnectionMonitor } from './ConnectionMonitor';
import { SyncMonitor } from './SyncMonitor';

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

/**
 * How long after the relay connects before we expect the doc to have synced.
 * A relay sync is one exchange, not a peer negotiation, so this stays tighter
 * than the webrtc transport's sync grace period.
 */
const SYNC_ERROR_GRACE_PERIOD_MS = 5000;

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
  private monitor: ConnectionMonitor;
  private syncMonitor: SyncMonitor;
  private readonly statusListeners = new Map<(event: NetworkStatusEvent) => void, (wsEvent: { status: string }) => void>();

  status(): string {
    return this.provider.wsconnected ? 'connected' : 'connecting';
  }

  /** Resolves once the Y.Doc has been restored from IndexedDB. */
  public whenSynced(): Promise<void> {
    return this.persistence.whenSynced.then(() => undefined);
  }

  public on(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    // The disconnected clock is owned by the ConnectionMonitor; here we only
    // read it to decide whether the UI should still say "connecting" or has
    // waited long enough to show a real error.
    const wrapped = (wsEvent: { status: string }) => {
      if (wsEvent.status === 'connected') {
        callback({ status: 'connected' });
        return;
      }
      callback(this.monitor.isStuck()
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

    // Report an unreachable relay once we've been disconnected past the grace
    // period. The monitor arms at construction, so an initial load that never
    // connects is caught the same as a mid-session drop.
    this.monitor = new ConnectionMonitor({
      transport: 'websocket',
      graceMs: CONNECTION_ERROR_GRACE_PERIOD_MS,
      sentryMessage: 'WebSocket relay unreachable',
      context: { url: WS_SERVER_URL, roomName: config.roomName },
    });

    this.syncMonitor = new SyncMonitor({
      transport: 'websocket',
      graceMs: SYNC_ERROR_GRACE_PERIOD_MS,
      sentryMessage: 'WebSocket relay sync timed out',
      context: { url: WS_SERVER_URL, roomName: config.roomName },
    });

    this.setupEventListeners();
    this.setupAwareness();
    this.monitorConnection();
  }

  /**
   * y-websocket has one connection, so its 'status' event maps directly onto
   * the monitor's connected/disconnected edges. The SyncMonitor rides along:
   * armed on connect, disarmed (silently) on disconnect so a fresh episode
   * starts cleanly on the next reconnect rather than measuring across the gap.
   *
   * 'connecting' is its own edge, not a flavour of 'disconnected': y-websocket
   * emits it from setupWS() for every socket it opens, i.e. once per retry. That
   * is what lets connect_ms time the attempt that succeeded instead of the whole
   * outage — see ConnectionMonitor.markConnecting().
   */
  private monitorConnection(): void {
    this.provider.on('status', ({ status }: { status: string }) => {
      if (status === 'connected') {
        this.monitor.markConnected();
        this.syncMonitor.arm();
      } else if (status === 'connecting') {
        this.monitor.markConnecting();
        this.syncMonitor.disarm();
      } else {
        this.monitor.markDisconnected();
        this.syncMonitor.disarm();
      }
    });
    this.provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        this.syncMonitor.markSynced();
      }
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
    this.monitor.destroy();
    this.syncMonitor.destroy();

    this.persistence.destroy();
  }
}