# Yjs WebSocket relay

The **default** transport for Aura (`src/infrastructure/networking/WebsocketProvider.ts`
connects to `wss://digitalocean-ws-ipv4.aura0.app`). WebRTC is the alternative — see
`src/infrastructure/networking/README.md`. WebSocket is the default because peer discovery
over `wss:443` works on restrictive networks where peer-to-peer UDP does not.

Deployed to the DigitalOcean droplet (`aura-websocket-server`) under pm2 as `y-websocket`,
on port 47964. The droplet also runs the card-search API on port 8000, so **this process
shares 1GB of RAM with another service** — its memory behavior matters.

## Why this isn't the stock server

`server.js` is `@y/websocket-server`'s stock entrypoint plus two changes. The wire protocol
is untouched: connections still go to the upstream `setupWSConnection`.

### 1. Room eviction (the important one)

Upstream only removes a room's `Y.Doc` from its in-memory `docs` map from inside a
`persistence !== null` branch — see `closeConn` in `@y/websocket-server/src/utils.js`:

```js
if (doc.conns.size === 0 && persistence !== null) {
  persistence.writeState(doc.name, doc).then(() => { doc.destroy() })
  docs.delete(doc.name)     // ← unreachable when persistence is null
}
```

`persistence` is non-null only when `YPERSISTENCE` is set. We ran the stock binary with just
`HOST` and `PORT`, so **every room ever opened stayed resident for the life of the process** —
including rooms nobody had been in for weeks. Memory only ever went up, until the droplet
OOM'd.

We don't want server-side durability — every client keeps its own IndexedDB copy of the room
and re-seeds the relay on rejoin — we only want the eviction. So `server.js` installs a
persistence layer that **stores nothing**, purely to make that branch reachable:

```js
setPersistence({ provider: null, bindState: async () => {}, writeState: async () => {} })
```

It looks like dead code. It is not. Deleting it reintroduces an unbounded memory leak.

**Consequence to be aware of:** once every client leaves a room, the relay forgets it. A player
returning to that room restores it from their own IndexedDB and re-seeds the relay. A *brand-new*
device opening a link to a long-dormant room sees an empty board. That was already true in
practice — the retained state never survived a deploy, reboot, or OOM — so this replaces a coin
flip with a predictable rule, and doesn't remove a guarantee anyone had.

If we ever *do* want durable rooms, the fix is `YPERSISTENCE` (LevelDB) plus a retention policy,
not removing the shim.

### 2. Health endpoint

`GET /health` → `{"status":"ok","rooms":N}`, where `N` is `docs.size` — the live entry count of
the very map that used to leak. This makes eviction directly observable in prod instead of
inferred from RSS. Aggregate only; it exposes no room names.

## Deploy

⚠️ **This directory now has its own `node_modules`.** pm2 previously ran
`./node_modules/.bin/y-websocket-server` resolved from the repo root; `ecosystem.config.cjs` now
sets `cwd: __dirname` and runs `./server.js`, so dependencies must be installed **here**. A
`git pull && pm2 reload` alone is not enough the first time.

On the droplet:

```bash
cd <repo>/networking/websocket
npm ci                      # required — this directory has its own deps now
pm2 reload ecosystem.config.cjs
pm2 save                    # persist across reboot
```

Verify:

```bash
curl -s localhost:47964/health     # {"status":"ok","rooms":N}
pm2 describe y-websocket           # check RSS
```

Then open a room in the app, close every tab, and confirm `rooms` returns to its prior value
rather than ratcheting up. RSS should come back down after a play session instead of climbing
monotonically.

## Tests

```bash
npm test
```

`test/room-eviction.test.js` asserts directly on the upstream `docs` map: rooms are held while
clients are connected, survive one client of several leaving, and are evicted once the room
empties. Comment out `installRoomEviction()` and the eviction test fails — that's the regression
this guards.
