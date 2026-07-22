# Networking Module

Real-time synchronization for Aura using Yjs, over either WebRTC or WebSocket.

## Overview

This module handles all networking and persistence for the application:

- **Peer-to-peer connections** via WebRTC, or a central relay via WebSocket (no game state server either way)
- **CRDT-based state sync** using Yjs for conflict-free merging
- **Local persistence** via IndexedDB for instant restoration on reload
- **Session persistence** to maintain player identity across page reloads

## Transport selection

`yjsNetworkFactory.create(yDoc, config, transport)` builds a `WebRTCProvider` or
`WebsocketProvider` depending on `transport` (`'webrtc'` | `'websocket'`, defaults to `'webrtc'`).
`bootstrap.ts` decides which one to pass by resolving the `network-transport-websocket` PostHog
flag via `resolveNetworkTransport()` in `infrastructure/analytics/FeatureFlags.ts` before
constructing the provider. Both providers implement the same `YjsNetworkProvider` interface, so
nothing downstream (`Player`, `App.tsx`, hotkeys, etc.) needs to know which transport is active.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  index.ts (Application Layer)                           │
│  - Creates Y.Doc and initializes WebRTCProvider         │
│  - Uses getOrCreatePlayerId() and getOrCreatePeerId()   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  WebRTCProvider (This Module)                           │
│  - Wraps y-webrtc and y-indexeddb                       │
│  - Manages peer connections and persistence             │
│  - Handles awareness state (user presence)              │
└─────────────┬───────────────────────┬───────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────────────┐
│  y-webrtc           │   │  y-indexeddb                │
│  (Network Layer)    │   │  (Persistence Layer)        │
│                     │   │                             │
│  - WebRTC signaling │   │  - Stores Y.Doc in IndexedDB│
│  - Peer discovery   │   │  - Instant restoration      │
│  - State sync       │   │                             │
└─────────────────────┘   └─────────────────────────────┘
```

## Files

### `WebRTCProvider.ts`
Main class that orchestrates networking and persistence.

**Key responsibilities:**
- Initialize y-webrtc provider for peer connections
- Initialize y-indexeddb for local state persistence
- Set persistent peer ID to prevent "new user" on reload
- Restore and persist awareness state (user metadata)
- Emit connection status events (peer count, online/offline)

**Example usage:**
```typescript
const yDoc = new Y.Doc();
const playerId = getOrCreatePlayerId();
const peerId = getOrCreatePeerId();

const provider = new WebRTCProvider(yDoc, {
  roomName: 'mtg-abc123',
  peerId, // Optional: maintains identity across reloads
  signalingServers: ['wss://...'], // Optional: custom signaling servers
  iceServers: [{ urls: 'stun:...' }], // Optional: custom STUN/TURN
});

// Listen for connection status changes
provider.on('status', (event) => {
  console.log(`Status: ${event.status}`);
});

// Clean up on exit
provider.destroy();
```

### `persistence.ts`
Utilities for managing session persistence across page reloads.

**Key functions:**
- `getOrCreatePlayerId()` - Returns persistent player ID from localStorage
- `getOrCreatePeerId()` - Returns persistent peer ID from localStorage
- `saveAwarenessState()` / `restoreAwarenessState()` - Persist user metadata
- `setupAwarenessStatePersistence()` - Auto-save on page unload
- `clearPersistedSession()` - Reset all persisted data

**Example usage:**
```typescript
// Get or create persistent IDs
const playerId = getOrCreatePlayerId(); // "player-abc123"
const peerId = getOrCreatePeerId();     // UUID

// Save custom awareness state
saveAwarenessState({ name: 'Alice', color: '#ff0000' });

// Restore on next load
const state = restoreAwarenessState(); // { name: 'Alice', color: '#ff0000' }

// Clear all persisted data (useful for "new session" button)
clearPersistedSession();
```

### `types.ts`
TypeScript interfaces for WebRTC configuration and connection status.

**Interfaces:**
- `NetworkConfig` - Fields shared by every transport (`roomName`, `peerId`)
- `WebRTCConfig` - Configuration for WebRTCProvider constructor
- `WebsocketConfig` - Configuration for WebsocketProvider constructor
- `AwarenessState` - User presence metadata (extensible)

## How WebRTC Works in Aura

### 1. Room-Based Connections

Users connect by sharing a room URL:
```
https://aura.example.com/?room=mtg-abc123
                                 ^^^^^^^^^^
                                 Unique room ID
```

All users with the same `room` parameter connect to each other via WebRTC.

### 2. Signaling Server

WebRTC needs a signaling server to discover peers (not for game state):

```
User A                 Signaling Server              User B
  │                           │                        │
  ├──────"Join mtg-abc123"───>│                        │
  │                           │<──"Join mtg-abc123"────┤
  │                           │                        │
  │<─────"User B is here"─────┤                        │
  ├─────"User A is here"──────>│                        │
  │                           │                        │
  │                     Direct WebRTC connection       │
  ├<────────────────────────────────────────────────>┤
  │         All game state syncs peer-to-peer         │
```

**Default signaling server:** `wss://y-webrtc-eu-production-1328.up.railway.app`

### 3. STUN/TURN Servers

STUN servers help with NAT traversal (finding your public IP):

```
User behind NAT ──> STUN Server ──> "Your public IP is X.X.X.X"
```

**Default STUN servers:**
- `stun:stun.l.google.com:19302` (Google)
- `stun:global.stun.twilio.com:3478` (Twilio)

### 4. State Synchronization

Yjs uses **CRDTs** (Conflict-free Replicated Data Types) to merge changes:

```
User A: Sets card X position to (100, 200)
User B: Sets card X position to (150, 200)  [at the same time]

Without CRDT: ❌ Conflict! Which position wins?
With CRDT:    ✅ Last-write-wins based on Lamport timestamp
```

**Example Y.Doc structure:**
```typescript
yDoc = {
  "cards": {                      // Shared battlefield
    "card-abc": { x: 100, y: 200, rotation: 90, ... },
    "card-xyz": { x: 300, y: 400, ... }
  },
  "player-alice123": {            // Per-player state
    health: 20,
    hand: [card1, card2],
    exilePile: [],
    discardPile: []
  },
  "player-bob456": {              // Other player
    health: 18,
    ...
  }
}
```

All changes to `yDoc.getMap(YDOC_CARDS_ON_BOARD)` automatically sync to all peers.

## Local Persistence (IndexedDB)

When you reload the page:

1. **Load Y.Doc from IndexedDB** (instant, even before WebRTC connects)
2. **Connect to signaling server** and discover peers
3. **Sync any missed updates** via WebRTC

This provides an **offline-first experience** where the app works even with no internet, and syncs when reconnected.

**Storage location:**

`y-indexeddb` names its database after the room, verbatim — there is **one IndexedDB database per
room**, not one shared `yjs` database with a table per room:

- Room `mtg-a1b2c3d` → IndexedDB database `mtg-a1b2c3d`

Room docs are opened through `createRoomPersistence()` (`roomDocStorage.ts`) rather than by
constructing `IndexeddbPersistence` directly, so that opening a room also registers it as alive.

**Garbage collection:**

Because room ids are minted fresh per game, an uncollected database would be left behind by every
game a player ever opens. `purgeExpiredRoomDocs()` runs at boot and deletes room docs not opened in
`ROOM_DOC_MAX_AGE_MS` (30 days).

It is deliberately conservative, because **the relay keeps no durable copy of a room** (it installs a
no-op persistence and forgets a room once the last client leaves — see `networking/websocket/`). The
client's IndexedDB copy *is* the game, so collecting one is data loss, not cache eviction:

- The room being played is never collected, however stale its stamp.
- An unrecognized database is *adopted* (stamped with now), never deleted on sight — so shipping the
  collector can't destroy rooms that predate it.
- Only names **in the registry** are ever deleted, and only room-shaped names are ever adopted. This
  is what keeps `aura-decks` — every deck the player has ever saved — off the chopping block.

Adoption depends on `indexedDB.databases()`, which **Firefox does not implement**. There, adoption
silently finds nothing and pre-existing orphans are never collected. That is the intended trade, not
an oversight: under-adopting leaks a database, over-adopting deletes somebody's game. We under-adopt.
Rooms still register themselves as they're opened, so the leak does not grow going forward.

**To clear local state:**
```typescript
import { clearPersistedSession } from './persistence';
import { clearDocument } from 'y-indexeddb';

clearPersistedSession();
clearDocument(roomName); // Clear one room's Y.Doc — the database IS the room name
```

## Session Persistence

Without session persistence:
```
User loads page
  ├─> New player ID: "player-abc123"
  ├─> Connects to peers
  └─> Plays some cards

User reloads page
  ├─> New player ID: "player-xyz789"  ❌ Appears as different user!
  ├─> Reconnects to peers             ❌ Peers see new user joined
  └─> State lost                      ❌ All progress gone
```

With session persistence:
```
User loads page
  ├─> Get player ID: "player-abc123" (from localStorage)
  ├─> Get peer ID: <UUID> (from localStorage)
  ├─> Load Y.Doc from IndexedDB
  └─> Connect with persistent peer ID

User reloads page
  ├─> Same player ID: "player-abc123"  ✅ Same identity
  ├─> Same peer ID: <UUID>             ✅ No flicker in peer list
  ├─> Y.Doc restored from IndexedDB    ✅ All cards and state restored
  └─> Reconnects seamlessly            ✅ Appears as same user
```

## Testing

### Test WebRTC Connections Locally

1. Start dev server: `npm run dev`
2. Open `http://localhost:5173` in first browser window
3. Copy full URL including `?room=xxx` parameter
4. Open same URL in second window (or different browser)
5. Verify "Connected (1 peer)" status in both windows
6. Test synchronization by moving cards in one window

### Test Session Persistence

1. Open app, note the player ID in console: `Player ID: player-abc123`
2. Make some changes (draw cards, play cards, modify health)
3. Reload the page (Cmd+R or Ctrl+R)
4. Verify same player ID appears in console
5. Verify all cards and state are restored

### Test Offline Behavior

1. Open app and make changes
2. Disconnect from internet (disable WiFi)
3. Continue making changes (works offline!)
4. Reload page (state restored from IndexedDB)
5. Reconnect to internet (syncs with peers)

## Troubleshooting

### "Waiting for peers..." forever

**Possible causes:**
1. Different room names (check URL `?room=` parameter)
2. Signaling server down (check browser console for WebSocket errors)
3. Firewall blocking WebRTC (try different network)
4. STUN server unreachable (try adding TURN server)

**Fix:**
```typescript
// Add TURN server for better NAT traversal
const provider = new WebRTCProvider(yDoc, {
  roomName,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
});
```

### State not persisting after reload

**Check:**
1. Browser has IndexedDB enabled (not in private/incognito mode)
2. localStorage is enabled
3. Console for IndexedDB errors

**Fix:**
```javascript
// In browser console, check IndexedDB
indexedDB.databases().then(dbs => console.log(dbs));
// Should see one database per room you've opened, named after the room itself:
//   [{ name: 'mtg-a1b2c3d', version: 1 }, { name: 'aura-decks', version: 1 }, ...]
// (Firefox does not implement indexedDB.databases(); use the Storage inspector there.)
```

### Peer ID changes on every reload

**Check:**
1. localStorage is working
2. `getOrCreatePeerId()` is being called
3. Peer ID is passed to WebRTCProvider

**Fix:**
```typescript
// Verify in browser console
localStorage.getItem('aura:peerId'); // Should return UUID
```

## Resources

- [Yjs Documentation](https://docs.yjs.dev/)
- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [y-indexeddb GitHub](https://github.com/yjs/y-indexeddb)
- [WebRTC Specification](https://webrtc.org/)
- [Aura WEBRTC_SETUP.md](../../../docs/networking/WEBRTC_SETUP.md) - Detailed signaling server setup

## Future Improvements

- [ ] Add awareness state for cursor positions
- [ ] Implement username/color selection UI
- [ ] Add peer presence indicators (who's online)
- [ ] Implement reconnection backoff strategy
- [ ] Add telemetry for connection quality
- [ ] Support multiple rooms per user (spectator mode)