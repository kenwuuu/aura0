import { DeckImportEnv, errorResponse, handleDeckImport } from './deckImport';
import { handleSentryTunnel, isSentryTunnelRequest } from './sentryTunnel';

// The MoxfieldGate Durable Object is deliberately NOT exported here. It lives in
// its own Worker (workers/moxfield-gate/) and is reached through a cross-script
// binding, because a DO migration cannot be applied by the `versions upload`
// this repo's branch builds use, and because a DO lifecycle change would
// permanently foreclose rolling this Worker back past it. See wrangler.jsonc.

/**
 * The Worker in front of Aura's static assets.
 *
 * Both routes it serves exist for the same underlying reason — something a
 * browser cannot reach directly:
 *
 *  - `/api/diag`        Sentry's ingest, which ad-blockers block outright. The
 *                       players losing their reports are the ones hitting the
 *                       strangest bugs. See `sentryTunnel.ts`.
 *  - `/api/deck-import` deck sites, which refuse cross-origin reads. Archidekt
 *                       answers every request with a hardcoded
 *                       `Access-Control-Allow-Origin: http://localhost:3000`.
 *                       See `deckImport.ts`.
 *
 * Every path not listed in `run_worker_first` (wrangler.jsonc) is left to the
 * asset router, so the SPA is served exactly as it was before this file existed.
 *
 * ── If you are resolving a merge conflict here ──────────────────────────────
 * More than one branch adds routes to this Worker. Conflicts here are additive:
 * keep *both* routes, and keep every route's pattern in the `run_worker_first`
 * array. A route dropped from that array does not 404 —
 * `not_found_handling: "single-page-application"` answers it with `index.html`
 * and a `200`, so the caller gets HTML where it expected JSON and nothing
 * anywhere reports an error. The current `/api/*` glob already covers both.
 */

type Env = DeckImportEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (isSentryTunnelRequest(pathname)) {
      return handleSentryTunnel(request);
    }

    if (pathname === '/api/deck-import') {
      return handleDeckImport(request, env);
    }

    // Anything else under /api/ is ours and does not exist. Answering in JSON
    // rather than text keeps every response from this prefix one shape, so a
    // caller can parse the body without first guessing what it got.
    if (pathname.startsWith('/api/')) {
      return errorResponse('Not found', 404);
    }

    // Unreachable under the current `run_worker_first` patterns, but deferring
    // to the assets binding keeps this Worker correct if those patterns widen.
    return env.ASSETS.fetch(request);
  },
};
