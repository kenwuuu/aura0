# Transport Upgrade — Opportunistic WebSocket → WebRTC (deferred)

**Status:** designed, not started. Extracted from the memory-leak-fix plan's
"deliberately not doing now" appendix so the design has a tracked home.

## Why

Move peers onto WebRTC peer-to-peer when they have a working mesh edge, keeping
the WebSocket relay as the reliable fallback. Two payoffs:

1. **Relay bandwidth** — meshed peers stop routing every update through the
   relay.
2. **Room unification across transports** — running both providers on one doc is
   also what lets transport stay a *per-client* capability without splitting a
   room (a WS-only and a WebRTC-only client bridge through anyone on both). See
   the "region yes, transport no" section of
   [`RELAY_HORIZONTAL_SCALING.md`](./RELAY_HORIZONTAL_SCALING.md).

Worth it for bandwidth — **not** for server memory. The relay's memory cost was
per-room, not per-socket, and is fixed separately (the eviction shim);
evacuating sockets onto WebRTC would free ~zero memory.

## The design (settled)

- **Run both providers on the same `Y.Doc`.** Yjs providers are additive and
  CRDT merges are idempotent, so a doc connected to both the relay and the mesh
  just sees two redundant update paths.
- **Per-edge fallback rule:** *stay on WebSocket iff you have a WebRTC edge to a
  known peer that won't connect.* No bridge election needed — edge failures are
  symmetric, so both endpoints of a broken edge land on the relay together and
  stay reachable to each other there.
- **Signaling stays the permanent rendezvous.** y-webrtc's signaling is
  `wss:443` — same reachability as the relay (restrictive networks block UDP,
  not `wss`), so late joiners are always discoverable even when they can't mesh.
  Never tear signaling down.
- **Any `WebrtcConn.connected` counts** as a working edge — no TURN / `getStats`
  relay-candidate check.
- **Park the socket with `disconnect()`, never `destroy()`** so it can be resumed
  when a peer's mesh edge drops.

## Blockers (fix before building on this)

1. **`WebsocketProvider.destroy()` never tears down its socket.** It cleans up
   monitors, the room heartbeat, and IndexedDB persistence, but never calls
   `disconnect()`/`destroy()` on the underlying `WsProvider` (contrast
   `WebRTCProvider`, which does disconnect its provider). Dormant today because
   nothing calls it in prod — but it is exactly the call any "park the
   WebSocket" work depends on, and it would silently do nothing.
   `src/infrastructure/networking/WebsocketProvider.ts`.
2. **Each provider mints its own `Awareness`.** Hoist a single shared `Awareness`
   into `yjsNetworkFactory` and pass it to both providers (both libraries accept
   an `awareness` option). Today `bootstrap.ts` writes `playerId` onto whichever
   provider won and `usePeerCursors.ts` reads it back — running both at once
   would desync peer identity. The same duplication exists for the per-provider
   `IndexeddbPersistence` and `beforeunload` handlers.
