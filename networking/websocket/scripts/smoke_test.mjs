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

console.log(failed ? '== SMOKE TEST FAILED ==' : '== smoke test passed ==');
process.exit(failed ? 1 : 0);
