#!/usr/bin/env node
/**
 * The relay's program entrypoint — the thing pm2 runs. See ecosystem.config.cjs.
 *
 * This exists as its own module so that listening is unconditional. `server.js` used to
 * decide whether to listen by comparing `import.meta.url` against `process.argv[1]` (the
 * usual "am I the main module?" idiom). Under pm2 that comparison is always false: pm2's
 * fork mode sets `argv[1]` to its own `lib/ProcessContainerFork.js`, not to the app
 * script. The relay would boot, bind nothing, exit with no output, and get restarted
 * forever — while `node server.js` by hand worked fine, which is what made it so easy to
 * miss. Keep the listen call here, out of any module a test or another program imports.
 */
import * as number from 'lib0/number';
import { createRelay } from './server.js';

const host = process.env.HOST || 'localhost';
const port = number.parseInt(process.env.PORT || '1234');

createRelay().listen(port, host, () => {
  console.log(`y-websocket relay running at '${host}' on port ${port}`);
});
