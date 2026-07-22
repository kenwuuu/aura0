import { errorResponse, handleDeckImport } from './deckImport';

/**
 * The Worker in front of Aura's static assets.
 *
 * It exists for exactly one reason: deck sites do not allow browsers to read
 * their APIs, so importing a deck by URL needs a same-origin endpoint to go
 * through. See `deckImport.ts` for why, and for the endpoint itself.
 *
 * Every other path is left to the asset router. `run_worker_first` in
 * wrangler.jsonc narrows this Worker to `/api/*`, so the SPA is served exactly
 * as it was before this file existed.
 */

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/deck-import') {
      return handleDeckImport(request);
    }

    if (pathname.startsWith('/api/')) {
      return errorResponse('Not found', 404);
    }

    // Unreachable under the current `run_worker_first` patterns, but deferring
    // to the assets binding keeps this Worker correct if those patterns widen.
    return env.ASSETS.fetch(request);
  },
};
