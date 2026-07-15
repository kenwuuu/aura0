# DO Relay Prototype — Outline

Migrating the Yjs WebSocket relay from the self-hosted droplet
(`networking/websocket/server.js`, `@y/websocket-server`) to a Cloudflare
Durable Object.

Scoped to prove one thing: **the existing `y-websocket` client syncs through a
Durable Object with no client code change, and survives a room going cold.**
Everything not in service of that proof is deferred.

## Why this is a good fit

The current relay is thin — `setupWSConnection` plus a health endpoint and an
eviction hack. Migration is ~90% a server rewrite (that file becomes a DO) and
~10% client (one URL: `VITE_WS_SERVER_URL`, already overridable in
`src/infrastructure/networking/WebsocketProvider.ts`). The Yjs wire protocol is
unchanged, so `y-websocket`'s `WebsocketProvider` keeps working as-is. WebRTC
fallback, IndexedDB persistence, `ConnectionMonitor`/`SyncMonitor`, and the
transport-split factory are untouched.

Each room becomes its own DO — isolated memory + single thread. At ≤6 users per
room you use ~0.02% of a DO's 32,768-connection cap, and total rooms are
effectively unbounded (linear cost, no single-box ceiling). Hibernation means
idle tables cost ~nothing. This also removes the eviction hack and the
`@y/websocket-server` caret landmine, and relieves the card-API-vs-websocket
OOM co-location on the droplet.

## Files (the whole prototype)

| File | Contents | Size |
|---|---|---|
| `relay-do/wrangler.jsonc` | DO binding `RELAY`, migration `new_sqlite_classes: ["YjsRoom"]`, `compatibility_date`, observability on | ~25 lines, boilerplate |
| `relay-do/src/index.ts` | Worker `fetch`: assert `Upgrade: websocket`, parse room from the path (match y-websocket's `serverUrl/<room>` scheme so the client is unchanged), `env.RELAY.getByName(room).fetch(req)`. Plus a `/health` route. | ~30 lines |
| `relay-do/src/YjsRoom.ts` | **The only real file.** Hibernatable DO. See breakdown below. | ~40 (library) / ~150 (hand-roll) |
| `relay-do/package.json` | `y-durableobjects` (pinned exact, no caret), `wrangler`, `@cloudflare/workers-types` | — |
| client `.env.local` | `VITE_WS_SERVER_URL=ws://127.0.0.1:8787` → `wrangler dev`. No source change. | 1 line |

### `YjsRoom.ts` responsibilities

- **Constructor:** load persisted Y.Doc state from DO SQLite storage into an
  in-memory `Y.Doc` + `Awareness`. This is what makes hibernation survivable.
- **`fetch`:** `ctx.acceptWebSocket(server)` (hibernation API, *not*
  `ws.accept()`), send Yjs sync-step-1 to the new client.
- **`webSocketMessage`:** decode message type — sync vs awareness — apply to the
  doc, **persist the update to storage**, broadcast to `ctx.getWebSockets()`
  except the sender.
- **`webSocketClose`:** clear the departing client's awareness state (kills
  ghost cursors), and if it was the last socket, set an Alarm for eventual GC
  (stubbed for the prototype).

## Verification contract (the actual point of this exercise)

The code is easy; these are the checks that separate "looks done" from "works."
Written as pass/fail before any code, per this project's "prove it fails first"
rule.

- **V1 — Relay, not just connect.** Two **independent browser contexts**
  (Playwright contexts, *not* two tabs — separate storage partitions mean
  separate `BroadcastChannel`, so the DO is the only sync path) join the same
  room; a card moved in A appears in B. Two tabs would false-green via
  `BroadcastChannel`.
- **V2 — Cold-room rejoin (the empty-board class).** Open a room, place cards,
  **close every client**, then join fresh in a new context with IndexedDB
  cleared. The board must repopulate **from the DO's storage**. Comes back empty
  → rehydration is broken. This is the case a naive smoke test never touches
  because the doc never leaves memory.
- **V3 — Awareness cleanup.** A and B both see each other's cursor; A
  disconnects; A's cursor disappears for B.
- **V4 — Teeth.** Re-run V1 and V2 against a deliberately broken DO (comment out
  the broadcast, then the storage write) and confirm each test goes **red**. A
  test you haven't watched fail isn't evidence.

Run these through the existing `tests/e2e/harness/` (real incremental mouse
moves, no teleports), pointed at `wrangler dev`.

## Decisions to lock before coding

1. **Library vs hand-roll** — recommend `y-durableobjects` pinned exact for the
   spike; revisit for production. (Judgment call given the
   `@y/websocket-server` caret history.)
2. **Server-side persistence is now yes** — hibernation requires it. Confirm
   we're OK that the DO holds a durable copy (the thing the droplet relay
   deliberately avoided). Upside: clearing IndexedDB stops being catastrophic.
3. **URL scheme** must match `y-websocket`'s `serverUrl/<room>` so
   `VITE_WS_SERVER_URL` is the only client change.

## Explicitly out of scope for the prototype

Real Alarm-based room GC (stub/log only), `/health` room-count parity with the
old relay, PostHog-flagged staged rollout, droplet decommission. All
production-cutover concerns — none needed to prove the architecture.

## Build sequence

1. Scaffold worker + `wrangler.jsonc`, deploy a hello-DO, confirm `wrangler dev`
   serves an upgrade.
2. Wire the protocol → **V1 green**.
3. Add storage persist + constructor rehydrate → **V2 green**.
4. Awareness cleanup → **V3 green**.
5. Break-it-on-purpose → **V4 red on the broken build**, green on the real one.

Roughly an afternoon to V1, a day to all four if the sync handshake doesn't
fight us.