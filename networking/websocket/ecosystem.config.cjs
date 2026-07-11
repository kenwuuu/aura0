// pm2 config for the Yjs WebSocket relay. The app name matches the existing pm2
// process, so `pm2 reload y-websocket` keeps working.
//
// This used to run the stock `./node_modules/.bin/y-websocket-server` binary, which
// never releases a room's Y.Doc and leaked memory until the droplet OOM'd. It now
// runs our own entrypoint — the same server plus room eviction. See README.md.
//
// `cwd` pins pm2 to this directory so `./server.js` and its `node_modules` resolve
// here rather than at the repo root.
module.exports = {
  apps: [
    {
      name: 'y-websocket',
      cwd: __dirname,
      script: './server.js',
      env: {
        HOST: '0.0.0.0',
        PORT: '47964',
      },
    },
  ],
};
