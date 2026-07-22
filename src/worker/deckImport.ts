import { extractArchidektDeck } from '../features/deck-manager/url-import/archidekt';
import { ImportedDeck } from '../features/deck-manager/url-import/importedDeck';
import {
  DeckUrlRef,
  parseDeckUrl,
  sourceLabel,
  upstreamApiUrl,
} from '../features/deck-manager/url-import/deckUrls';

/**
 * The `/api/deck-import` endpoint, as a plain `Request` → `Response` function.
 *
 * It lives apart from the Worker entry point so the Vite dev server can serve
 * the same endpoint from the same code. Running one implementation in both
 * places is the point: a dev-only reimplementation would be exactly the kind of
 * thing that works locally and fails in production.
 *
 * It needs nothing but `fetch`, `Request` and `Response`, all of which
 * workerd and Node share.
 */

/**
 * How long to wait on the upstream site before giving up.
 *
 * Well under the ~30s a browser will sit on a fetch, so a slow deck site
 * surfaces as our error message rather than as a request that never settles.
 */
const UPSTREAM_TIMEOUT_MS = 10_000;

/** Edge-cache upstream deck documents briefly — a shared link is often opened by a whole pod at once. */
const UPSTREAM_CACHE_TTL_SECONDS = 300;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * An error the player should read verbatim. Anything not raised as one of these
 * is reported generically, so an upstream failure can't leak internals into the
 * import dialog.
 */
export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export async function handleDeckImport(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const requested = new URL(request.url).searchParams.get('url');
  if (requested === null || requested.trim().length === 0) {
    return errorResponse('Missing deck URL.', 400);
  }

  // The client's URL is re-parsed here rather than trusted. What comes back is a
  // site and an id, and the address we actually request is rebuilt from those —
  // so this endpoint can only ever reach deck APIs we know, never an arbitrary
  // host handed to it by a caller.
  const ref = parseDeckUrl(requested);
  if (ref === null) {
    return errorResponse(
      "That doesn't look like a deck URL we support. Paste an Archidekt deck link, e.g. https://archidekt.com/decks/24569510/my-deck",
      400,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamApiUrl(ref), {
      headers: {
        accept: 'application/json',
        // Identify ourselves rather than arriving as an anonymous scraper.
        'user-agent': 'Aura/1.0 (+https://aura0.app) deck import',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Honoured by workerd; ignored by Node, which is why it is only a cache hint.
      cf: { cacheTtl: UPSTREAM_CACHE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
  } catch {
    // Timeout or transport failure — the site is unreachable from here.
    return errorResponse(`Couldn't reach ${sourceLabel(ref.source)}. Please try again.`, 504);
  }

  if (!upstream.ok) {
    return errorResponse(upstreamMessage(ref, upstream.status), upstream.status === 404 ? 404 : 502);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return errorResponse(`${sourceLabel(ref.source)} returned a response we couldn't read.`, 502);
  }

  let deck: ImportedDeck;
  try {
    deck = extractArchidektDeck(payload as Parameters<typeof extractArchidektDeck>[0]);
  } catch (error) {
    // extractArchidektDeck throws only with player-facing text (empty or
    // private deck, or a shape it no longer recognizes).
    const message =
      error instanceof Error ? error.message : `Couldn't read that ${sourceLabel(ref.source)} deck.`;
    return errorResponse(message, 422);
  }

  return jsonResponse(deck);
}

/** Turn an upstream status into something a player can act on. */
function upstreamMessage(ref: DeckUrlRef, status: number): string {
  const site = sourceLabel(ref.source);

  if (status === 404) {
    return `That ${site} deck doesn't exist. Check the link, or make sure the deck isn't private.`;
  }
  if (status === 403 || status === 401) {
    return `That ${site} deck is private, so we can't read it. Make it public or unlisted and try again.`;
  }
  if (status === 429) {
    return `${site} is rate-limiting us right now. Wait a moment and try again.`;
  }
  return `${site} returned an error (${status}). Please try again later.`;
}
