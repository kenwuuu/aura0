/**
 * Guards the Yjs-major skew that took production down on 2026-07-13.
 *
 * `@y/websocket-server` was declared as `^0.1.1`. 0.1.5 — a *patch* bump inside that range —
 * moved its dependency from Yjs 13 to `yjs: ^14.0.0-7` (`@y/y@14.0.0-rc.7`). Because this
 * directory has its own isolated node_modules, npm happily installed the v14 line here while
 * every browser client is on `yjs@13`. The relay then answered sync step 1 with v14-encoded
 * structs that a v13 client cannot decode.
 *
 * The failure is invisible at the transport layer: the WebSocket upgrade succeeds, the room is
 * created, `docs.size` behaves perfectly, and `/health` looks healthy. In prod it showed up as
 * connections at 100% success and `sync_outcome` at 100% `timed_out` — boards that never load.
 *
 * The other tests here (and the deploy smoke test) all speak raw `ws` or assert on the
 * in-process `docs` map, so NONE of them could see it. This one connects the same
 * `y-websocket` client the app ships, and asserts the two things that actually matter:
 * a client reaches `synced`, and a write reaches a second client.
 *
 * If this ever fails with a decode error out of `readSyncStep2`, check for a Yjs major skew
 * before anything else — and keep `@y/websocket-server` pinned exactly, not caret-ranged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';
import { createRelay } from '../server.js';

const SYNC_TIMEOUT_MS = 5000;

/** Resolves true on sync, false if we hit the timeout — never rejects, so the assert reads clean. */
function syncedWithin(provider, ms = SYNC_TIMEOUT_MS) {
  return Promise.race([
    new Promise((resolve) => provider.on('sync', (isSynced) => isSynced && resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

/**
 * Teardown order is load-bearing: `server.close()` waits on the upgraded WebSocket, so the
 * providers must be destroyed BEFORE it, or the hooks deadlock and the file times out.
 */
async function startRelay(t) {
  const server = createRelay();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const providers = [];

  t.after(async () => {
    providers.forEach((provider) => provider.destroy());
    // Let the server see the socket close, so upstream's per-connection ping interval is
    // cleared — otherwise it keeps the event loop alive and the test file never exits.
    await new Promise((resolve) => setTimeout(resolve, 200));
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  return {
    port: server.address().port,
    connect(room, doc) {
      const provider = new WebsocketProvider(`ws://127.0.0.1:${server.address().port}`, room, doc, {
        WebSocketPolyfill: WebSocket,
        // MUST stay off. y-websocket also syncs peers over a local BroadcastChannel, and two
        // clients in one test process share it — so a write reaches the other doc WITHOUT ever
        // touching the relay. With `disableBc` unset, this whole file passes against a relay
        // that cannot apply a single update. That false green is exactly what shipped the
        // 2026-07-13 outage. Keep the relay the only path between these two clients.
        disableBc: true,
      });
      providers.push(provider);
      return provider;
    },
  };
}

test('a real Yjs client reaches synced against the relay', async (t) => {
  const relay = await startRelay(t);

  const doc = new Y.Doc();
  const provider = relay.connect('aura-sync-room', doc);

  // Against a Yjs-14 server this never fires: the client cannot decode the sync step 2.
  assert.ok(
    await syncedWithin(provider),
    'client never reached synced — check for a Yjs major-version skew between the relay and the client',
  );
});

test('a write propagates from one client to another through the relay', async (t) => {
  const relay = await startRelay(t);

  const docA = new Y.Doc();
  const providerA = relay.connect('aura-propagation-room', docA);
  assert.ok(await syncedWithin(providerA), 'first client never synced');

  const docB = new Y.Doc();
  const providerB = relay.connect('aura-propagation-room', docB);
  assert.ok(await syncedWithin(providerB), 'second client never synced');

  docA.getMap('board').set('card', 'Black Lotus');

  const seen = await Promise.race([
    new Promise((resolve) => {
      const check = () => docB.getMap('board').get('card') === 'Black Lotus' && resolve(true);
      docB.getMap('board').observe(check);
      check(); // in case it already landed
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), SYNC_TIMEOUT_MS)),
  ]);

  assert.ok(seen, 'the write never reached the second client — the relay is not relaying');
});
