/**
 * Guards the failure that took the relay down on 2026-07-11: the process starts, binds
 * nothing, and exits silently, so pm2 restart-loops it forever while Caddy 502s.
 *
 * The bug was a main-module guard in server.js —
 * `import.meta.url === pathToFileURL(process.argv[1]).href` — which is always false under
 * pm2, because pm2's fork mode sets `argv[1]` to its own `lib/ProcessContainerFork.js`
 * rather than to the app script. Running `node server.js` by hand passed the guard and
 * listened, which is exactly why this survived local testing and the unit suite (those
 * import `createRelay()` directly and never launch a program at all).
 *
 * So testing "does `node main.js` listen?" would NOT have caught it. This test reproduces
 * pm2's launch shape instead: set `argv[1]` to a foreign path, then import the entrypoint,
 * and assert it still serves /health. Against the old server.js this fails; against main.js
 * it passes because nothing is conditional on argv anymore.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const MAIN_URL = new URL('../main.js', import.meta.url).href;

/** A path that is not the entrypoint — stands in for pm2's ProcessContainerFork.js. */
const FOREIGN_ARGV1 = fileURLToPath(new URL('../node_modules/.bin/pm2-container.js', import.meta.url));

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

/** Polls /health until it answers or the deadline passes. Returns the parsed body, or null. */
async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return await res.json();
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

test('the entrypoint listens when launched the way pm2 launches it', async (t) => {
  const port = await freePort();

  // pm2 sets argv[1] to its own container module, then loads the app. Mimic that exactly.
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `process.argv[1] = ${JSON.stringify(FOREIGN_ARGV1)}; await import(${JSON.stringify(MAIN_URL)});`,
    ],
    {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let exitedEarly = null;
  child.on('exit', (code) => {
    exitedEarly = code;
  });

  t.after(() => {
    child.kill('SIGKILL');
  });

  const health = await waitForHealth(port);

  assert.notEqual(
    exitedEarly,
    0,
    'entrypoint exited immediately instead of listening — this is the pm2 restart-loop bug: ' +
      'something made the listen() call conditional on argv again',
  );
  assert.deepEqual(
    health,
    { status: 'ok', rooms: 0 },
    `entrypoint never served /health on port ${port} when argv[1] was not the app script`,
  );
});
