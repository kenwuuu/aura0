/**
 * Guards the fix for the room-doc memory leak.
 *
 * The relay used to retain a Y.Doc for every room ever opened, for the life of the
 * process. `docs` is the upstream in-memory room map, so asserting on its size tests
 * the leak directly rather than through a proxy like RSS.
 *
 * Delete `installRoomEviction()` from server.js and the second assertion fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { docs } from '@y/websocket-server/utils';
import { createRelay } from '../server.js';

/** Polls until `predicate` holds, so we don't race the server's close handling. */
async function waitFor(predicate, description, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${description}`);
}

function openClient(port, room) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/${room}`);
  return new Promise((resolve, reject) => {
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}

test('the relay evicts a room once its last client disconnects', async (t) => {
  const server = createRelay();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const rooms = ['aura-room-a', 'aura-room-b', 'aura-room-c'];
  const clients = await Promise.all(rooms.map((room) => openClient(port, room)));

  await waitFor(() => docs.size === rooms.length, `${rooms.length} rooms to be held`);
  assert.deepEqual([...docs.keys()].sort(), [...rooms].sort());

  clients.forEach((socket) => socket.close());

  // Before the fix this stayed at 3 forever: the room map was only ever added to.
  await waitFor(() => docs.size === 0, 'every room to be evicted');
});

test('a room survives while any client is still connected', async (t) => {
  const server = createRelay();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const [first, second] = await Promise.all([
    openClient(port, 'aura-shared-room'),
    openClient(port, 'aura-shared-room'),
  ]);
  await waitFor(() => docs.size === 1, 'the shared room to be held');

  // Eviction is keyed on the room emptying, not on any single client leaving — a
  // player refreshing must not drop the room out from under everyone else.
  first.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(docs.size, 1, 'room was evicted while a client was still connected');

  second.close();
  await waitFor(() => docs.size === 0, 'the room to be evicted once empty');
});
