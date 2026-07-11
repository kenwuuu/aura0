# Yjs WebSocket relay

The **default** transport for Aura (`src/infrastructure/networking/WebsocketProvider.ts`
connects to `wss://digitalocean-ws-ipv4.aura0.app`). WebRTC is the alternative — see
`src/infrastructure/networking/README.md`. WebSocket is the default because peer discovery
over `wss:443` works on restrictive networks where peer-to-peer UDP does not.

Deployed to the DigitalOcean droplet (`aura-websocket-server`) under pm2 as `y-websocket`,
on port 47964. The droplet also runs the card-search API on port 8000, so **this process
shares 1GB of RAM with another service** — its memory behavior matters.

## Layout

- `main.js` — the program pm2 runs. Its only job is to `listen()`.
- `server.js` — builds the http server (`createRelay()`); never listens. Tests import this.

The split is deliberate, and load-bearing. `server.js` used to listen from behind the usual
`import.meta.url === pathToFileURL(process.argv[1]).href` "am I the main module?" guard. **Under
pm2 that guard is always false** — pm2's fork mode sets `argv[1]` to its own
`lib/ProcessContainerFork.js`, not to your script. The relay booted, bound nothing, exited
silently, and pm2 restart-looped it forever with empty logs, while `node server.js` by hand
worked perfectly. Don't reintroduce a main-module guard here; keep `listen()` in a module
nothing else imports.

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

⚠️ **This directory has its own `node_modules`.** pm2 previously ran
`./node_modules/.bin/y-websocket-server` resolved from the repo root; `ecosystem.config.cjs` now
sets `cwd: __dirname` and runs `./main.js`, so dependencies must be installed **here**. A
`git pull && pm2 reload` alone is not enough the first time.

⚠️ **`pm2 reload` will not switch to the new entrypoint.** For a fork-mode app, `reload`
re-runs the process definition pm2 already has registered — it does not re-read
`ecosystem.config.cjs`. Coming from the stock binary you must `delete` + `start`, or pm2 will
keep running `y-websocket-server` and every check below will still pass against the *old* code.

The droplet has **no git credentials for this (private) repo** — `git pull` there fails. Ship
code the same way `mtg_card_search/scripts/deploy.sh` does: `git archive` locally, `scp`, extract.

On the droplet:

```bash
cd /root/aura/networking/websocket
npm ci                             # required — this directory has its own deps
pm2 delete y-websocket             # NOT `reload` — see above
pm2 start ecosystem.config.cjs
pm2 save                           # persist across reboot
```

Verify — **all three, in order.** The first is the one that actually distinguishes new from old:

```bash
curl -s localhost:47964/health     # {"status":"ok","rooms":N}  ← JSON = new code.
                                   # plain `okay` = still the stock binary; the deploy did NOT take.
pm2 describe y-websocket           # restarts must be 0 and stable. A climbing count with EMPTY
                                   # logs is the never-listened failure — roll back, don't retry.
pm2 logs y-websocket --lines 5     # expect "y-websocket relay running at '0.0.0.0' on port 47964"
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
