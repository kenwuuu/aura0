/**
 * Smoke test for a *running* relay instance — the gate a blue-green deploy must pass
 * before Caddy is flipped to it. Run against the idle port, never the live one.
 *
 *   node scripts/smoke_test.mjs 47965
 *
 * The unit tests assert on the in-process `docs` map, which is unreachable from out
 * here. `/health` exposes `rooms: docs.size`, so these assertions ride on that — which
 * is also the one signal that distinguishes our code from the stock binary at all (the
 * stock server has no /health and answers every path with plain-text `okay`).
 *
 * It only needs `ws`, a production dependency, so it runs against a `--omit=dev` install.
 */
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const port = process.argv[2];
if (!port) {
  console.error('usage: node scripts/smoke_test.mjs <port>');
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;

let failed = false;
function check(ok, description, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${description}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

/** Polls, so we never race the server's async close handling. */
async function waitFor(predicate, description, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ...last, ok: false, timedOut: true, description };
}

async function health() {
  const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    // The stock binary's answer. Return it raw so the caller can say so out loud.
    throw new Error(`/health returned non-JSON (${JSON.stringify(body)}) — this is the STOCK binary`);
  }
}

function openClient(room) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/${room}`);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
    setTimeout(() => reject(new Error(`timed out connecting to room ${room}`)), 5000);
  });
}

const closed = (socket) => new Promise((resolve) => { socket.once('close', resolve); socket.close(); });
const rooms = async () => (await health()).rooms;

console.log(`== smoke-testing relay on :${port} ==`);

let body;
try {
  body = await health();
} catch (error) {
  check(false, 'GET /health returns JSON (i.e. this is our code, not the stock binary)', error.message);
  process.exit(1);
}
check(body.status === 'ok', 'GET /health reports status ok', JSON.stringify(body));
check(typeof body.rooms === 'number', 'GET /health reports a numeric room count', JSON.stringify(body));

const baseline = body.rooms;
console.log(`  ..  baseline room count: ${baseline}`);

// A unique room name, so a smoke test can never collide with a real game in progress
// (this runs against the idle instance, but belt and braces).
const room = `aura-smoke-${process.pid}-${Date.now()}`;

const first = await openClient(room);
const second = await openClient(room);
let result = await waitFor(async () => {
  const n = await rooms();
  return { ok: n === baseline + 1, n };
}, 'the room to be held');
check(result.ok, 'a connected client makes the relay hold its room', `rooms=${result.n}, want ${baseline + 1}`);

// Eviction must key on the room emptying, not on any single client leaving. If this
// regresses, a player refreshing their tab drops the room out from under everyone else
// — strictly worse than the leak we're fixing. Flip on this and games break.
await closed(first);
await new Promise((r) => setTimeout(r, 500));
const held = await rooms();
check(held === baseline + 1, 'the room survives while another client is still connected', `rooms=${held}, want ${baseline + 1}`);

// The leak fix itself. Against the stock binary this stays up forever.
await closed(second);
result = await waitFor(async () => {
  const n = await rooms();
  return { ok: n === baseline, n };
}, 'the room to be evicted');
check(result.ok, 'the room is evicted once its last client disconnects', `rooms=${result.n}, want ${baseline}`);

// ---------------------------------------------------------------------------
// Does the relay actually RELAY? Everything above passes against a relay that
// cannot apply a single Yjs update — that is precisely what shipped on
// 2026-07-13: /health was green, rooms came and went correctly, and every board
// in production stayed empty because a broken dependency tree made the server
// throw on every incoming update. Raw `ws` sockets cannot see that. Only a real
// Yjs client can. Never flip on the checks above alone.
// ---------------------------------------------------------------------------
const syncRoom = `aura-smoke-sync-${process.pid}-${Date.now()}`;

function connectClient(doc) {
  return new WebsocketProvider(`ws://127.0.0.1:${port}`, syncRoom, doc, {
    WebSocketPolyfill: WebSocket,
    // Off, or the two clients below sync to each other over a local BroadcastChannel and
    // the relay is never actually exercised. That false green is the whole reason this
    // section exists.
    disableBc: true,
  });
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const syncedWithin = (provider, ms = 8000) =>
  Promise.race([
    new Promise((resolve) => provider.on('sync', (isSynced) => isSynced && resolve(true))),
    settle(ms).then(() => false),
  ]);

const docA = new Y.Doc();
const providerA = connectClient(docA);
const aSynced = await syncedWithin(providerA);
check(aSynced, 'a real Yjs client reaches synced against the relay');

const docB = new Y.Doc();
const providerB = connectClient(docB);
const bSynced = await syncedWithin(providerB);
check(bSynced, 'a second real Yjs client reaches synced');

docA.getMap('board').set('card', 'Black Lotus');

const propagated = await Promise.race([
  new Promise((resolve) => {
    const seen = () => docB.getMap('board').get('card') === 'Black Lotus' && resolve(true);
    docB.getMap('board').observe(seen);
    seen();
  }),
  settle(8000).then(() => false),
]);
check(propagated, "a write on one client reaches another THROUGH the relay (it is actually relaying)");

providerA.destroy();
providerB.destroy();
await settle(300);

console.log(failed ? '== SMOKE TEST FAILED ==' : '== smoke test passed ==');
process.exit(failed ? 1 : 0);
