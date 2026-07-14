# Relay runbook

Operating the Yjs WebSocket relay on the DigitalOcean droplet — health checks, deploys,
rollback, and the rules that have each cost us an outage.

The *why* behind the code (the eviction shim, the Yjs pin, the `main.js` split) lives in
[`networking/websocket/README.md`](../networking/websocket/README.md). This is the ops side.

## 30-second triage

```bash
curl -s https://digitalocean-ws-ipv4.aura0.app/health
```

| response | meaning |
|---|---|
| `{"status":"ok","rooms":N}` | ✅ our relay, room eviction on |
| `okay` (plain text) | 🚨 the **stock binary** is running — the memory leak is live |
| nothing / 502 | 🚨 relay down; players are on WebRTC fallback or stuck |

`rooms` is `docs.size` — the live room count. It should **fall as rooms empty**. If it only
ever climbs, eviction has regressed and you are leaking again.

## The relay is deployed blue-green

Two ports, **47964** and **47965**, pm2 app `y-websocket-<port>`. Caddy proxies exactly one;
the other is idle. **Neither port is permanently "the live one"** — they swap on every deploy,
so never assume, always look.

### Which port is live?

```bash
cd /root/aura/networking/websocket && ./scripts/deploy.sh status
```

```
Caddy serves : 47965          ← live: every player is on this one
idle port    : 47964          ← idle: safe to deploy onto

:47965  (live) -> {"status":"ok","rooms":49}
:47964  (idle) -> (unreachable)
```

If the script isn't available, **the Caddyfile is the ground truth** — Caddy is what decides
which port is live, so ask it directly:

```bash
grep -oE 'reverse_proxy localhost:(47964|47965)' /etc/caddy/Caddyfile   # -> the LIVE port
```

The other port is the idle one. Two more things worth checking by hand:

```bash
/root/aura/node_modules/pm2/bin/pm2 list        # which y-websocket-<port> apps exist
curl -s http://127.0.0.1:47964/health           # ask each port what it is
curl -s http://127.0.0.1:47965/health
```

A port's `/health` also tells you *which binary* is on it — JSON is ours, plain `okay` is the
stock leaking binary, and `(unreachable)` means nothing is running there.

### Deploying a change

There are no git credentials on the droplet, so ship the code in:

```bash
# locally, from the repo root
git archive --format=tar.gz -o relay.tgz HEAD networking/websocket
scp relay.tgz root@138.197.78.138:/root/
# on the droplet
cd /root/aura && tar xzf /root/relay.tgz && cd networking/websocket
```

Then, in order — **do not skip step 3**:

1. **`./scripts/deploy.sh stage`** — brings the new code up on **the idle port** (it works out
   which one; you don't pick) and smoke-tests it there. Aborts on any pm2 restart or smoke
   failure. Touches nothing serving users; safe any time. It prints the port it staged on —
   that's your `$STAGED` below.
2. **Verify the resolved tree**, because a bad `npm ci` is how we broke prod once:
   ```bash
   node -e 'console.log(require("./node_modules/@y/websocket-server/package.json").version,
                        require("./node_modules/yjs/package.json").version)'   # want 0.1.1 13.x
   find node_modules -path '*@y/y*' -o -path '*@y/protocols*'                  # want EMPTY
   ```
3. **Drive it from a real browser.** The staged port isn't public, so tunnel to it. Substitute
   the port `stage` just used — **do not assume 47965**, it alternates every deploy:
   ```bash
   STAGED=47965   # <-- whatever `deploy.sh status` calls the idle port
   ssh -L $STAGED:127.0.0.1:$STAGED root@138.197.78.138
   VITE_WS_SERVER_URL=ws://127.0.0.1:$STAGED npm run dev    # then open two boards
   ```
   Confirm the tunnel reached the *staged* relay, not the live one — `curl
   http://127.0.0.1:$STAGED/health` must return JSON, and its `rooms` count should be ~0 while
   the live port carries everyone.

   Then move a card and watch it cross. **This is the step that catches what the tests can't** —
   every automated check we had passed against a relay that synced nothing.
4. **`./scripts/deploy.sh flip`** — points Caddy at the staged port. The old instance keeps
   running, so rollback is one command. **Now check the public URL**: it must return JSON, not
   `okay`. This is the first proof of the Cloudflare → Caddy → relay hop, which the tunnel
   cannot cover.
5. **Confirm sync on the real site.**
6. **`./scripts/deploy.sh drain`** — stops the old instance. Do this **promptly**.

### Rollback

`./scripts/deploy.sh rollback` — points Caddy back. **Only works before `drain`**, because
that's what keeps the old instance warm. After a drain there is nothing to flip back to; you
re-stage instead.

## The rules that cost us outages

**Never put a caret on `@y/websocket-server`.** It's pinned to exactly `0.1.1`. The `^0.1.1`
range silently took `0.1.5`, a *patch* bump that moved to Yjs 14 and pulled two mutually
incompatible prereleases into the tree. Sockets connected, rooms created and evicted,
`/health` was green — and **every board in production was empty** for 15 minutes. See the
[incident report](incidents/2026-07-13-relay-sync-outage.md).

**Room accounting proves the relay is *alive*, not that it is *relaying*.** Never flip on
`/health` alone. And in any multi-client test, **`disableBc: true` is mandatory** — y-websocket
syncs same-process clients over a local BroadcastChannel, bypassing the relay entirely, so a
two-client test will pass against a relay that cannot apply a single update.

**Fusing `flip` and `drain` does not shorten the blip — it only destroys the rollback window.**
This is worth understanding once, properly:

- `flip` causes **no blip**. A Caddy reload doesn't migrate established connections, so players
  already connected stay on the old instance; only new connections land on the new one.
- `drain` **is** the blip: killing the old instance drops its sockets and those clients
  reconnect. That reconnect takes the same time whether you drained 5 seconds or 5 minutes
  after the flip.
- The gap between them costs a transient **split** (two players in one room on different
  instances can't see each other — `docs` is per-process). Yjs is a CRDT, so it converges the
  moment they're back together. It's the same divergence as someone's wifi dropping.
- The gap **buys the rollback window**. That's the trade: a benign, self-healing split in
  exchange for a working escape hatch. Keep the gap short. Don't set it to zero.

**Caddy: keep `grace_period` set.** The Caddyfile's global block has `grace_period 10s`. Caddy's
default is *unlimited* — on reload it waits forever for old servers to drain, and ours never
drain (long-lived WebSockets plus Cloudflare's persistent origin keepalives). Without it every
`systemctl reload caddy` hangs: systemd sits in `reloading`, retrying every 90s forever, and the
admin API on `:2019` dies. Traffic keeps serving throughout, so it's easy to miss. Confirm with:

```bash
journalctl -u caddy | grep "grace period"
# want: "servers shutting down; grace period initiated","duration":10
# bad:  "servers shutting down with eternal grace period"
```

**A reload cannot fix a wedged reload.** If Caddy is stuck in `reloading`, only
`systemctl restart caddy` gets out of it (that also drops live WebSockets — one reconnect).
A restart does **not** restart the relay, so the relay keeps its rooms.

**Don't keep Caddyfile backups around.** A backup encodes a port and a config generation, so it
goes stale the moment you flip or edit — after a drain, a `.bak` pointing at the drained port
will take the relay *down* if restored. Back up at edit time, restore or delete when done. The
live file is the source of truth. (`deploy.sh` still drops `.bak.<ts>` files on flip; they're
valid until you drain, and garbage after.)

## Droplet facts

- `root@138.197.78.138`, **1 GB RAM**, nyc3, droplet `aura-websocket-server` (id `534144144`).
  It runs **both** the relay and the card-search API (`uvicorn`, `:8000`). Caddy fronts both:
  `/v1/*` → `:8000`, everything else → the relay.
- **pm2 is not on `PATH`** over non-interactive ssh: `/root/aura/node_modules/pm2/bin/pm2`.
- **`pm2 reload` is a trap** — a fork-mode app does *not* re-read `ecosystem.config.cjs`. Use
  `delete` + `start` (the deploy script does).
- The relay has `max_memory_restart: '450M'`. With eviction working it should never be reached,
  so **a breach is a signal that eviction regressed**, not routine. Without a ceiling, V8's own
  heap cap (~490 MB on this box) aborts the process outright and pm2 restarts it — which is what
  the leak was doing roughly every 13 hours, dropping every connected player at once.
- Droplet memory isn't in `doctl`; pull it from the DO API
  (`/v2/monitoring/metrics/droplet/memory_available`).

## Open

- Relay binds `0.0.0.0` (uvicorn binds `127.0.0.1`). ufw default-denies inbound so it isn't
  exposed, but tightening it is a free win.
- **Durable Objects** — one DO per room with WebSocket Hibernation — would make this class of
  leak impossible and decouple the relay from the card API's box. Worth a spike.
