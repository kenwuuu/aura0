import { handleSentryTunnel, isSentryTunnelRequest } from './sentryTunnel';

/**
 * The Worker in front of Aura's static assets.
 *
 * Every path not listed in `run_worker_first` (wrangler.jsonc) is left to the
 * asset router, so the SPA is served exactly as it was before this file
 * existed.
 *
 * ── If you are resolving a merge conflict here ──────────────────────────────
 * More than one branch adds routes to this Worker (the deck-URL import
 * endpoint is the other). Conflicts here are additive: keep *both* routes, and
 * keep every route's pattern in the `run_worker_first` array. A route dropped
 * from that array does not 404 — `not_found_handling: "single-page-application"`
 * answers it with `index.html` and a `200`, so the caller gets HTML where it
 * expected JSON and nothing anywhere reports an error.
 */

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (isSentryTunnelRequest(pathname)) {
      return handleSentryTunnel(request);
    }

    if (pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    // Unreachable under the current `run_worker_first` patterns, but deferring
    // to the assets binding keeps this Worker correct if those patterns widen.
    return env.ASSETS.fetch(request);
  },
};
