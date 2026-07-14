# Yjs WebSocket relay

The **default** transport for Aura (`src/infrastructure/networking/WebsocketProvider.ts`
connects to `wss://digitalocean-ws-ipv4.aura0.app`). WebRTC is the alternative — see
`src/infrastructure/networking/README.md`. WebSocket is the default because peer discovery
over `wss:443` works on restrictive networks where peer-to-peer UDP does not.

Deployed to the DigitalOcean droplet (`aura-websocket-server`) under pm2 as
`y-websocket-<port>`, on 47964 or 47965 — whichever the last blue-green deploy landed on; ask
`./scripts/deploy.sh status`. The droplet also runs the card-search API on port 8000, so **this
process shares 1GB of RAM with another service** — its memory behavior matters.

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

## `@y/websocket-server` is pinned exactly. Do not put a caret on it.

`package.json` pins `"@y/websocket-server": "0.1.1"` — no `^`. This is not tidiness, it is the
fix for the 2026-07-13 outage.

`0.1.1` declares no `yjs` dependency at all, so it uses whatever Yjs the host tree provides —
here, `yjs@13`, the same major the browser client ships. `0.1.5` — a **patch** bump, inside the
`^0.1.1` range npm will happily take — moved to `yjs: ^14.0.0-7`. Because this directory has its
own isolated `node_modules`, that pulled a Yjs 14 line in next to our Yjs 13. Worse, the 0.1.5
tree pulls **two mutually incompatible Yjs 14 prereleases**: `@y/protocols@1.0.6-rc.1` resolves
`@y/y@14.0.0-rc.7`, while `@y/websocket-server` uses a nested `yjs@14.0.0-16`. The sync protocol
builds structs with one and hands them to a `Doc` from the other, and the relay throws
`TypeError: store.getClock is not a function` on **every incoming update**.

What that looks like in production is the nasty part: the WebSocket upgrade succeeds, rooms are
created and evicted correctly, and `/health` is green — while every board stays empty. Telemetry
showed `connection_outcome` at ~100% connected and `sync_outcome` at ~100% `timed_out`.

`test/client-sync.test.js` and the deploy smoke test now both drive a real Yjs client and assert
a write actually crosses the relay. Run them before believing any relay is healthy.

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

The relay runs on **one of two ports, 47964 and 47965**, under pm2 as `y-websocket-<port>`.
Caddy reverse-proxies exactly one of them; the other is idle. `scripts/deploy.sh` brings the
new code up on the idle port, proves it there, and only then moves Caddy — the same blue-green
shape the card-search API gets from its `mtg-card-search@.service` systemd template.

⚠️ **This directory has its own `node_modules`**, and the droplet has **no git credentials for
this (private) repo** — `git pull` there fails. Ship code in from a local `git archive`, the way
`mtg_card_search/scripts/deploy.sh` expects:

```bash
# locally
git archive --format=tar.gz -o relay.tgz HEAD networking/websocket
scp relay.tgz root@138.197.78.138:/root/
# on the droplet
cd /root/aura && tar xzf /root/relay.tgz && cd networking/websocket
```

Then:

```bash
./scripts/deploy.sh stage     # npm ci, start the idle port, smoke-test it.
                              # Touches nothing that serves users — safe any time.
./scripts/deploy.sh flip      # point Caddy at it. The old instance keeps RUNNING.
./scripts/deploy.sh rollback  # ...if it misbehaves. Instant — but only before `drain`.
./scripts/deploy.sh drain     # stop the old instance. Do this promptly (see below).
./scripts/deploy.sh status    # what's live, what's idle, health of both.
```

`stage` refuses to hand you a broken instance: it aborts if the process restarts even once (the
never-listened crash-loop signature, see Layout) or if `scripts/smoke_test.mjs` fails. That smoke
test asserts, via `/health`, that a room is held while a client is connected, **survives one
client of several leaving**, and is evicted once empty — and then, crucially, that **a real Yjs
client can write and have another client see it through the relay**.

That last assertion is the one that matters. Every other check on this page passes against a
relay that cannot apply a single update — that is exactly what shipped on 2026-07-13 and emptied
every board in production. Room accounting and `/health` tell you the relay is *alive*, not that
it is *relaying*. Never flip on them alone.

### Flip and drain are separate on purpose

A Caddy graceful reload does **not** migrate established connections. After `flip`, players
already connected stay pinned to the old instance while new connections land on the new one.
Relay instances share no state (`docs` is per-process), so during that window two players in one
room can sit on different instances and not see each other. Yjs is a CRDT, so this converges the
moment they're back on one instance — it's a transient split, not corruption, and it's the same
divergence the app already absorbs when someone's wifi drops. `drain` ends the window by kicking
the old instance's clients onto the new one.

So the gap between `flip` and `drain` is exactly your rollback window: keep it short, but *have*
it. Rolling back after `drain` is no longer a re-flip — there's nothing warm to flip back to.

### `pm2 reload` is a trap

For a fork-mode app, `reload` re-runs the process definition pm2 already has registered — it does
**not** re-read `ecosystem.config.cjs`. Coming from the stock binary, `pm2 reload` will happily
keep running `y-websocket-server` while every check appears to pass against the *old* code. Use
the script; it does `delete` + `start`.

**Plain-text `okay` from `/health` means the deploy did NOT take** — that's the stock binary,
which has no `/health` and answers every path with `okay`. JSON means it's ours.

## Tests

```bash
npm test
```

`test/room-eviction.test.js` asserts directly on the upstream `docs` map: rooms are held while
clients are connected, survive one client of several leaving, and are evicted once the room
empties. Comment out `installRoomEviction()` and the eviction test fails — that's the regression
this guards.

`test/entrypoint.test.js` launches the entrypoint with `argv[1]` pointed at a foreign path,
reproducing pm2's shape, and asserts `/health` still answers. It fails against the old
`server.js`; a "does `node main.js` start?" test would not have caught that.

`scripts/smoke_test.mjs` is the same eviction contract asserted against a *running* instance over
the network (it can't reach `docs`, so it reads `/health`). `deploy.sh stage` runs it. It needs
only `ws`, a production dependency, so it works against a `--omit=dev` install on the droplet.
