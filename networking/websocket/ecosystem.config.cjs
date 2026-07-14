// pm2 config for the Yjs WebSocket relay.
//
// This used to run the stock `./node_modules/.bin/y-websocket-server` binary, which
// never releases a room's Y.Doc and leaked memory until the droplet OOM'd. It now
// runs our own entrypoint — the same server plus room eviction. See README.md.
//
// `cwd` pins pm2 to this directory so `./main.js` and its `node_modules` resolve here
// rather than at the repo root.
//
// `script` must be main.js, not server.js: server.js only builds the http server, it
// never listens. See main.js for why the listen call cannot live behind an
// `import.meta.url === argv[1]` guard under pm2.
//
// The port is a parameter, and the app name carries it (`y-websocket-47964`), so that
// blue and green can run side by side during a deploy — the same trick the card-search
// API gets from its `mtg-card-search@.service` systemd template. scripts/deploy.sh
// drives it; don't start this by hand without RELAY_PORT unless you mean 47964.
const port = process.env.RELAY_PORT || '47964';

module.exports = {
  apps: [
    {
      name: `y-websocket-${port}`,
      cwd: __dirname,
      script: './main.js',
      // Room eviction should keep this flat, so a breach means eviction has regressed.
      // The ceiling is pm2's, not V8's, because V8's default 554 MB heap is unreachable
      // on a 1 GB box shared with the card API — the kernel OOM killer arrives first, and
      // it does not reliably pick the relay (on 2026-07-11 it killed fwupd instead).
      max_memory_restart: '450M',
      env: {
        // 0.0.0.0 matches the long-running deployment. The port is not exposed: ufw
        // defaults to deny-incoming and only Caddy (on localhost) proxies to it.
        HOST: '0.0.0.0',
        PORT: port,
      },
    },
  ],
};
