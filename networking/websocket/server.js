#!/usr/bin/env node
/**
 * Aura's Yjs WebSocket relay — the default transport (see
 * src/infrastructure/networking/WebsocketProvider.ts).
 *
 * This is @y/websocket-server's stock entrypoint (node_modules/@y/websocket-server/src/server.js)
 * plus two additions: room eviction (see installRoomEviction) and a health endpoint
 * that reports the live room count. The wire protocol is untouched — connections are
 * still handed to the upstream `setupWSConnection`.
 */
import { WebSocketServer } from 'ws';
import http from 'http';
import { setupWSConnection, setPersistence, docs } from '@y/websocket-server/utils';

/**
 * Make the relay release a room's Y.Doc once its last client disconnects.
 *
 * Upstream only evicts a room from its in-memory `docs` map from inside a
 * `persistence !== null` branch (see `closeConn` in @y/websocket-server/src/utils.js):
 *
 *     if (doc.conns.size === 0 && persistence !== null) {
 *       persistence.writeState(doc.name, doc).then(() => { doc.destroy() })
 *       docs.delete(doc.name)
 *     }
 *
 * A relay running without persistence therefore never reaches `docs.delete()`, and
 * retains every room ever opened for the life of the process — which is what
 * exhausted the droplet's memory.
 *
 * We do not want server-side durability: every client already keeps its own
 * IndexedDB copy of the room and re-seeds the relay on rejoin. We only want the
 * eviction. So we install a persistence layer that stores nothing, purely to make
 * that branch reachable. Deleting this reintroduces an unbounded memory leak.
 */
function installRoomEviction() {
  setPersistence({
    provider: null,
    bindState: async () => {},
    writeState: async () => {},
  });
}

/**
 * Builds the relay's http server. Does not listen — callers choose the port, so tests can
 * boot on an ephemeral one. The program that listens for real is main.js.
 */
export function createRelay() {
  installRoomEviction();

  const wss = new WebSocketServer({ noServer: true });

  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      // `rooms` is the live entry count of the docs map the leak used to grow without
      // bound, so it is the direct signal that eviction is working in prod. Aggregate
      // only — no room names.
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', rooms: docs.size }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('okay');
  });

  wss.on('connection', setupWSConnection);

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return server;
}
