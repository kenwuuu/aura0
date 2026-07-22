# 2026-07-13 — every board in production went empty

**Impact:** ~15 minutes. Players could open Aura and connect, but boards were empty and
nothing synced. Staging was hit too (it shares the relay).
**Trigger:** deploying the relay memory-leak fix.
**Resolution:** rolled back to the stock relay; recovered immediately.
**Status:** fixed and redeployed 2026-07-14 (see [runbook](../networking/RELAY_RUNBOOK.md)).

## What happened

We deployed a relay change to fix an unbounded memory leak. The new relay came up, passed
its health check, and served WebSocket connections normally — while silently failing to apply
a single update. Telemetry showed `connection_outcome` ~100% *connected* and `sync_outcome`
~100% *timed_out*: sockets up, boards empty.

## Why

`@y/websocket-server` was ranged `^0.1.1`.

- `0.1.1` declares **no `yjs` dependency**, so it uses the host tree's `yjs@13` — the same
  major the browser ships.
- `0.1.5` — a **patch** bump, inside that range, which npm took — moved to `yjs: ^14.0.0-7`.
  `networking/websocket/` has its own isolated `node_modules`, so nothing stopped it.

The resulting tree carried **two mutually incompatible Yjs 14 prereleases**:
`@y/protocols@1.0.6-rc.1` → `@y/y@14.0.0-rc.7`, alongside a nested `yjs@14.0.0-16`. The sync
protocol built structs with one and handed them to a `Doc` from the other, so the relay threw
`TypeError: store.getClock is not a function` on **every incoming update**.

Fix: pinned to exactly `0.1.1`.

## Why nothing caught it

This is the part worth keeping.

**The failure is invisible to every obvious check.** The WebSocket upgrade succeeds. The room
is created. `docs.size` rises and falls correctly. `/health` is green. All of that passes
against a relay that cannot apply a single update. **Room accounting proves a relay is *alive*,
not that it is *relaying*.**

Two false greens shipped it:

1. The smoke test asserted connections and room lifecycle only.
2. A real two-client sync test **still passed** — because y-websocket syncs same-process
   clients to each other over a local **BroadcastChannel**, bypassing the relay entirely.
   `disableBc: true` is mandatory in any multi-client relay test.

A third factor hid it beforehand: an unrelated pm2 crash-loop (the relay's `listen()` sat
behind a main-module guard that is always false under pm2's fork mode) meant the relay never
stayed up long enough for anyone to discover it couldn't sync.

**Rule adopted: a test you have never seen fail is not evidence.** Reproduce the failure, watch
the check go red, then restore.

## Aggravating factor

During the incident we drained the old instance too early, destroying the rollback window. The
flip-back then needed a hard `systemctl restart caddy`, because a graceful reload blocks
forever on live WebSockets and never activates the new config.

## What changed since

- `@y/websocket-server` pinned to `0.1.1`, no caret. Deploy verifies the resolved tree.
- The smoke test and `test/client-sync.test.js` now drive a **real Yjs client** and assert a
  write **crosses the relay**. Both were verified to fail on the broken tree.
- `deploy.sh stage` runs the smoke test on an idle port and aborts the deploy on failure.
- `WS_SERVER_URL` is now `VITE_WS_SERVER_URL`-overridable, so a relay can be driven from a real
  browser before it serves anyone. Previously it was hardcoded — which is *why* this reached
  staging and production simultaneously.
- Caddy's `grace_period` is now bounded (`10s`), so a reload completes instead of hanging.

## Still open

Staging and production **still share one relay**. The env var makes a separate staging relay
possible; it hasn't been stood up. Until it is, there is no environment where a relay change
can bake with real traffic before production sees it.
