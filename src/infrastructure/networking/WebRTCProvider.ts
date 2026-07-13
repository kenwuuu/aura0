/**
 * WebRTC Provider - Real-time peer-to-peer synchronization for Aura
 *
 * This module wraps y-webrtc and y-indexeddb to provide:
 * - Peer-to-peer WebRTC connections for real-time state sync
 * - Local IndexedDB persistence for offline-first experience
 * - Persistent peer identity across page reloads
 * - Awareness state restoration (user presence/metadata)
 *
 * ## How It Works
 *
 * 1. **Y.Doc (Yjs Document)**: Shared CRDT data structure that syncs between peers
 * 2. **WebRTC Provider**: Establishes peer-to-peer connections via signaling server
 * 3. **IndexedDB Persistence**: Stores Y.Doc locally for instant reload
 * 4. **Awareness**: Tracks which peers are online and their metadata
 *
 * ## Connection Flow
 *
 * ```
 * User opens page
 *     │
 *     ├─> Load Y.Doc from IndexedDB (instant restoration)
 *     │
 *     ├─> Connect to signaling server (wss://...)
 *     │       │
 *     │       └─> Discover peers in same room
 *     │               │
 *     │               └─> Establish WebRTC connections
 *     │                       │
 *     │                       └─> Sync Y.Doc state (bidirectional)
 *     │
 *     └─> Restore awareness state (username, color, etc.)
 * ```
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
import { WebrtcProvider, Room } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebRTCConfig } from './types';
import { restoreAwarenessState, setupAwarenessStatePersistence, AwarenessState } from './persistence';
import {NetworkStatusEvent, YjsNetworkProvider} from "@/infrastructure/networking/YjsNetworkFactory";
import { ConnectionMonitor } from './ConnectionMonitor';
import { SyncMonitor } from './SyncMonitor';
import { registerTransactionOriginClass } from './transactionOrigin';

// y-webrtc applies peer updates from its Room, not from the provider, so it is
// the Room that shows up as the transaction origin. Naming both these classes
// here keeps that origin readable in production telemetry, where the class names
// themselves are mangled.
registerTransactionOriginClass(Room, 'webrtc');
registerTransactionOriginClass(IndexeddbPersistence, 'indexeddb');

/**
 * How long every signaling socket can stay unreachable before we flag it.
 * Matches the WebSocket transport's threshold — signaling is itself a
 * websocket handshake, and a healthy one resolves in well under a second.
 */
const SIGNALING_ERROR_GRACE_PERIOD_MS = 3000;

/**
 * How long after a peer appears before we expect the doc to have synced with
 * them. Longer than the signaling threshold — this is real WebRTC/TURN
 * negotiation plus a CRDT exchange, not a single handshake.
 */
const SYNC_ERROR_GRACE_PERIOD_MS = 8000;

/**
 * The bits of a y-webrtc signaling socket we rely on (a lib0 WebsocketClient).
 * `provider.signalingConns` is not in y-webrtc's public types, so we describe
 * just what we touch rather than reaching for `any`.
 */
interface SignalingConnLike {
  connected: boolean;
  on(event: 'connect' | 'disconnect', handler: () => void): void;
  off(event: 'connect' | 'disconnect', handler: () => void): void;
}

/**
 * Main WebRTC provider class that manages peer-to-peer connections
 * and document persistence
 */
export class WebRTCProvider implements YjsNetworkProvider{
  private yDoc: Y.Doc;
  private provider: WebrtcProvider;
  private persistence: IndexeddbPersistence;
  private config: WebRTCConfig;
  private cleanupAwarenessPersistence?: () => void;
  private monitor: ConnectionMonitor;
  private syncMonitor: SyncMonitor;
  private latestPeerCount = 0;
  private signalingCleanup?: () => void;
  private syncPeersCleanup?: () => void;
  private readonly statusListeners = new Map<(event: NetworkStatusEvent) => void, (peersEvent: { webrtcPeers: string[] }) => void>();

  status(): string {
    return this.provider.connected ? 'connected' : 'connecting';
  }

  /** Resolves once the Y.Doc has been restored from IndexedDB. */
  public whenSynced(): Promise<void> {
    return this.persistence.whenSynced.then(() => undefined);
  }

  public on(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    // The UI status stays peer-based: "connected" means actually syncing with a
    // peer, and having no peers yet is normal (alone in the room), so this never
    // escalates to a UI 'error'. Signaling-unreachable failures ARE now detected
    // — but only reported to Sentry/PostHog via the ConnectionMonitor, not shown
    // in the UI, because "alone but signaling down" needs its own UX treatment
    // (a deliberate follow-up).
    const wrapped = (peersEvent: { webrtcPeers: string[] }) => {
      callback({ status: peersEvent.webrtcPeers.length > 0 ? 'connected' : 'connecting' });
    };
    this.statusListeners.set(callback, wrapped);
    this.provider.on('peers', wrapped);
  }

  public off(event: 'status', callback: (event: NetworkStatusEvent) => void): void {
    const wrapped = this.statusListeners.get(callback);
    if (wrapped) {
      this.provider.off('peers', wrapped);
      this.statusListeners.delete(callback);
    }
  }

  constructor(yDoc: Y.Doc, config: WebRTCConfig) {
    this.yDoc = yDoc;
    this.config = {
      roomName: config.roomName,
      peerId: config.peerId,
      signalingServers: config.signalingServers ?? [
        'wss://y-webrtc-eu-production-1328.up.railway.app',
      ],
      iceServers: config.iceServers ?? [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    };

    // Set up IndexedDB persistence for the Y.Doc
    // This persists the document state locally so it survives page reloads
    this.persistence = new IndexeddbPersistence(this.config.roomName, this.yDoc);

    this.provider = new WebrtcProvider(this.config.roomName, this.yDoc, {
      signaling: this.config.signalingServers,
      // @ts-ignore - y-webrtc uses peerOpts which isn't in the types
      peerOpts: {
        config: {
          iceServers: this.config.iceServers
        }
      }
    });

    // Set persistent peer ID if provided
    if (config.peerId) {
      // @ts-ignore - peerId is not officially exposed but can be set
      this.provider.peerId = config.peerId;
    }

    // Report unreachable signaling once we've been disconnected past the grace
    // period. Armed at construction, so an initial load whose signaling never
    // connects is caught the same as a mid-session signaling drop.
    this.monitor = new ConnectionMonitor({
      transport: 'webrtc',
      graceMs: SIGNALING_ERROR_GRACE_PERIOD_MS,
      sentryMessage: 'WebRTC signaling unreachable',
      context: {
        signalingServers: this.config.signalingServers,
        roomName: this.config.roomName,
      },
    });

    this.syncMonitor = new SyncMonitor({
      transport: 'webrtc',
      graceMs: SYNC_ERROR_GRACE_PERIOD_MS,
      sentryMessage: 'WebRTC peer sync timed out',
      context: { roomName: this.config.roomName },
    });

    this.setupEventListeners();
    this.setupAwareness();
    this.monitorSignaling();
    this.monitorSync();
  }

  /**
   * Drives the ConnectionMonitor from signaling reachability. Unlike
   * y-websocket there's no single connection status: y-webrtc keeps an array of
   * signaling sockets and `provider.connected` does NOT reflect them (it just
   * means "connect() was called"). Reachability = at least one signaling socket
   * open, so we watch each socket and recompute the aggregate on every change.
   */
  private monitorSignaling(): void {
    const conns = (this.provider as unknown as { signalingConns?: SignalingConnLike[] })
      .signalingConns ?? [];

    const sync = () => {
      if (conns.some((conn) => conn.connected)) {
        this.monitor.markConnected();
      } else {
        this.monitor.markDisconnected();
      }
    };

    conns.forEach((conn) => {
      conn.on('connect', sync);
      conn.on('disconnect', sync);
    });
    this.signalingCleanup = () => {
      conns.forEach((conn) => {
        conn.off('connect', sync);
        conn.off('disconnect', sync);
      });
    };

    // Signaling sockets are pooled across providers, so one may already be open;
    // reconcile once up front instead of waiting for the next event.
    sync();
  }

  private setupEventListeners(): void {
    this.provider.on('synced', (event: { synced: boolean }) => {
      console.log('Yjs synced:', event.synced);
      if (event.synced) {
        this.syncMonitor.markSynced(this.latestPeerCount);
      }
    });

    // Log when IndexedDB persistence is ready
    this.persistence.whenSynced.then(() => {
      console.log('Document loaded from IndexedDB');
    });
  }

  /**
   * Drives the SyncMonitor from peer presence: a solo player has nothing to
   * sync with, so the monitor only arms once a peer actually shows up, and
   * disarms (silently, no report) if that peer disappears before syncing —
   * that outage is the ConnectionMonitor/UI status's to surface, not this one's.
   */
  private monitorSync(): void {
    const onPeers = (peersEvent: { webrtcPeers: string[] }) => {
      this.latestPeerCount = peersEvent.webrtcPeers.length;
      if (this.latestPeerCount > 0) {
        this.syncMonitor.arm();
      } else {
        this.syncMonitor.disarm();
      }
    };
    this.provider.on('peers', onPeers);
    this.syncPeersCleanup = () => this.provider.off('peers', onPeers);
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

    // Signaling sockets are pooled and outlive this provider, so drop our
    // listeners before tearing down the monitor — otherwise a later signaling
    // event would re-arm the monitor and could report after teardown.
    this.signalingCleanup?.();
    this.monitor.destroy();

    this.syncPeersCleanup?.();
    this.syncMonitor.destroy();

    this.provider.destroy();
    this.persistence.destroy();
  }
}