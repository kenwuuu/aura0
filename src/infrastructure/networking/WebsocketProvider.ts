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

/**
 * How long the relay can stay unreachable before we stop calling it
 * "connecting" and surface a real error to the user. y-websocket retries
 * with exponential backoff forever on its own; this just decides when that
 * background retrying has gone on long enough to be worth interrupting the
 * user about.
 */
const CONNECTION_ERROR_GRACE_PERIOD_MS = 6000;
const CONNECTION_ERROR_MESSAGE = "Can't reach the game server over WebSocket. Switch to WebRTC in Settings to keep playing.";

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
  private readonly statusListeners = new Map<(event: NetworkStatusEvent) => void, (wsEvent: { status: string }) => void>();

  status(): string {
    return this.provider.wsconnected ? 'connected' : 'connecting';
  }

  /** Resolves once the Y.Doc has been restored from IndexedDB. */
  public whenSynced(): Promise<void> {
    return this.persistence.whenSynced.then(() => undefined);
  }

  public on(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    const wrapped = (wsEvent: { status: string }) => {
      if (wsEvent.status === 'connected') {
        this.disconnectedSince = null;
        callback({ status: 'connected' });
        return;
      }

      if (this.disconnectedSince === null) {
        this.disconnectedSince = Date.now();
      }
      const stuck = Date.now() - this.disconnectedSince > CONNECTION_ERROR_GRACE_PERIOD_MS;
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
      'wss://digitalocean-ws-ipv4.aura0.app',
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

    this.persistence.destroy();
  }
}