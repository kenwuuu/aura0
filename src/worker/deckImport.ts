import { extractArchidektDeck } from '../features/deck-manager/url-import/archidekt';
import { extractTappedOutDeck } from '../features/deck-manager/url-import/tappedout';
import {
  deckNameFromContentDisposition,
  extractMtgGoldfishDeck,
} from '../features/deck-manager/url-import/mtggoldfish';
import {
  extractEdhrecAverageDeck,
  extractEdhrecDeckPreview,
} from '../features/deck-manager/url-import/edhrec';
import { extractMoxfieldDeck } from '../features/deck-manager/url-import/moxfield';
import { ImportedDeck } from '../features/deck-manager/url-import/importedDeck';
import {
  DeckSource,
  DeckUrlRef,
  parseDeckUrl,
  requiresCredential,
  sourceLabel,
  upstreamApiUrl,
} from '../features/deck-manager/url-import/deckUrls';
import { GATE_NAME, SlotReservation } from './moxfieldGate';

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

/**
 * What each source actually serves. A deck preview is an HTML page rather than
 * an endpoint, so it has to ask for one.
 */
const ACCEPT_BY_SOURCE: Record<DeckSource, string> = {
  archidekt: 'application/json',
  'edhrec-average': 'application/json',
  edhrec: 'text/html, */*',
  tappedout: 'text/plain, */*',
  mtggoldfish: 'text/plain, */*',
  moxfield: 'application/json',
};

/**
 * What this endpoint needs from its environment.
 *
 * Everything is optional because the Vite dev server supplies it from
 * `.dev.vars` rather than from Worker bindings, and a contributor working on any
 * other deck source has no reason to hold a Moxfield credential. A Moxfield
 * import fails loudly when these are absent (see `credentialedFetchHeaders`)
 * rather than silently going out unauthenticated and collecting a 403.
 */
export type DeckImportEnv = {
  /** Secret. Set with `wrangler secret put`, never in wrangler.jsonc `vars`. */
  MOXFIELD_USER_AGENT?: string;
  MOXFIELD_GATE?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(url: string): Promise<Response> };
  };
  /**
   * Dev-only stand-in for the Durable Object, injected by vite.config.ts. One
   * Node process makes in-process arithmetic exactly as correct as the DO.
   */
  localGate?: { reserve(): SlotReservation };
};

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

export async function handleDeckImport(request: Request, env: DeckImportEnv = {}): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  if (!isFirstPartyRequest(request)) {
    return errorResponse('Not found', 404);
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
      "That doesn't look like a deck link we support. Paste an Archidekt, Moxfield, TappedOut, MTGGoldfish or EDHREC deck link, e.g. https://archidekt.com/decks/24569510/my-deck",
      400,
    );
  }

  let headers: Record<string, string>;
  try {
    headers = upstreamHeaders(ref, env);
  } catch {
    // A credentialed source with no credential configured. This is a deployment
    // fault, not the player's, and it must be loud: sending the request anyway
    // would collect a 403 and look exactly like a private deck.
    return errorResponse(
      `${sourceLabel(ref.source)} imports aren't configured on this deployment.`,
      503,
    );
  }

  const reservation = await reserveUpstreamSlot(ref, env);
  if (!reservation.granted) {
    return new Response(
      JSON.stringify({
        error: `${sourceLabel(ref.source)} imports are busy right now. Try again in a moment.`,
      }),
      {
        status: 429,
        headers: {
          ...JSON_HEADERS,
          // Seconds, rounded up — a `Retry-After` of 0 would invite an immediate retry.
          'retry-after': String(Math.ceil(reservation.retryAfterMs / 1000)),
        },
      },
    );
  }
  if (reservation.waitMs > 0) {
    await sleep(reservation.waitMs);
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamApiUrl(ref), {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Honoured by workerd; ignored by Node, which is why it is only a cache hint.
      cf: cacheHintFor(ref.source),
    } as RequestInit);
  } catch {
    // Timeout or transport failure — the site is unreachable from here.
    return errorResponse(`Couldn't reach ${sourceLabel(ref.source)}. Please try again.`, 504);
  }

  if (!upstream.ok) {
    return errorResponse(upstreamMessage(ref, upstream.status), upstream.status === 404 ? 404 : 502);
  }

  let deck: ImportedDeck;
  try {
    deck = await readDeck(ref, upstream);
  } catch (error) {
    // The adapters throw only with player-facing text (an empty or private
    // deck, or a shape they no longer recognize).
    const message =
      error instanceof Error ? error.message : `Couldn't read that ${sourceLabel(ref.source)} deck.`;
    return errorResponse(message, 422);
  }

  return jsonResponse(deck);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reject requests that didn't come from Aura's own pages.
 *
 * `Sec-Fetch-Site` is a **forbidden header name**: the Fetch spec bars scripts
 * from setting any `Sec-*` header, and only the user agent may attach it. That
 * makes this stronger than it looks in one direction and useless in another, and
 * the difference is worth being precise about:
 *
 *  - **Browser-based abuse cannot get past it.** No amount of JavaScript on
 *    another origin can forge `same-origin` here, because the browser writes
 *    this header itself and refuses to let script touch it.
 *  - **Non-browser clients walk straight through.** curl, or anything
 *    server-side, simply sets whatever it likes. This stops none of that.
 *
 * It is here because the Moxfield credential makes this endpoint worth pointing
 * a script at — abuse spends a rate limit belonging to Aura as a whole, and the
 * penalty is the credential being revoked for every player. Closing the browser
 * case completely is worth a few lines; the rest is what the rate gate and a
 * Cloudflare rate-limiting rule are for.
 *
 * Browsers send `same-origin` on a same-origin fetch, which is the only way the
 * app calls this (see `fetchImportedDeck.ts`). A 404 rather than a 403 keeps the
 * endpoint from confirming it exists.
 */
function isFirstPartyRequest(request: Request): boolean {
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/**
 * Headers for the upstream request, including a credential where one is needed.
 *
 * Throws when a credentialed source has no credential configured, so that a
 * misconfigured deployment fails at a recognizable point rather than sending an
 * anonymous request whose 403 is indistinguishable from a private deck.
 */
function upstreamHeaders(ref: DeckUrlRef, env: DeckImportEnv): Record<string, string> {
  const accept = ACCEPT_BY_SOURCE[ref.source];

  if (!requiresCredential(ref.source)) {
    // Identify ourselves rather than arriving as an anonymous scraper.
    return { accept, 'user-agent': 'Aura/1.0 (+https://aura0.app) deck import' };
  }

  const userAgent = env.MOXFIELD_USER_AGENT?.trim();
  if (userAgent === undefined || userAgent.length === 0) {
    throw new Error('missing credential');
  }

  return { accept, 'user-agent': userAgent };
}

/**
 * Claim a slot against a source's global rate cap.
 *
 * Only Moxfield has one. Everything else is granted immediately, which keeps the
 * gate from becoming a hop that every import pays for.
 */
async function reserveUpstreamSlot(
  ref: DeckUrlRef,
  env: DeckImportEnv,
): Promise<SlotReservation> {
  if (ref.source !== 'moxfield') {
    return { granted: true, waitMs: 0 };
  }

  if (env.localGate !== undefined) {
    return env.localGate.reserve();
  }

  if (env.MOXFIELD_GATE === undefined) {
    // No gate binding means we cannot prove we are under the cap, and the cost of
    // being over it is losing the credential. Decline rather than guess.
    return { granted: false, retryAfterMs: 1000 };
  }

  // Everything below fails *closed*. The gate lives in a separate Worker
  // (workers/moxfield-gate/), so it can be missing in ways a binding in this one
  // could not be: not yet deployed, deleted, or simply not running alongside
  // `wrangler dev`. In every one of those cases we cannot show we are under
  // Moxfield's cap, and sending anyway risks the credential for every player —
  // so an unreachable gate has to mean "don't send", never "send freely".
  try {
    const gate = env.MOXFIELD_GATE.get(env.MOXFIELD_GATE.idFromName(GATE_NAME));
    // The URL is required by the Durable Object fetch API but carries no meaning —
    // the object has exactly one operation.
    const response = await gate.fetch('https://moxfield-gate/reserve');
    const reservation: unknown = await response.json();

    // Validated rather than cast. An unreachable gate answers with a plain-text
    // error, and a bare `as SlotReservation` turned that into an unhandled
    // SyntaxError — a 500 with a stack trace where the player should have seen
    // one sentence.
    if (isSlotReservation(reservation)) {
      return reservation;
    }
    return { granted: false, retryAfterMs: 1000 };
  } catch {
    return { granted: false, retryAfterMs: 1000 };
  }
}

/** Narrow an unknown payload to a reservation, so a malformed one can't pass as granted. */
function isSlotReservation(value: unknown): value is SlotReservation {
  if (typeof value !== 'object' || value === null || !('granted' in value)) {
    return false;
  }
  const candidate = value as { granted: unknown; waitMs?: unknown; retryAfterMs?: unknown };
  return candidate.granted === true
    ? typeof candidate.waitMs === 'number'
    : candidate.granted === false && typeof candidate.retryAfterMs === 'number';
}

/**
 * Whether to let Cloudflare's edge cache a source's deck document.
 *
 * Moxfield is deliberately excluded. Caching it would be the obvious way to
 * stretch a one-request-per-second budget, but we don't yet know how often the
 * same deck is imported twice — so the repeat rate is being measured first
 * (`deck_url_import_requested` in PostHog) and a TTL will be chosen from data
 * rather than from a guess. Until then every Moxfield import is a real fetch,
 * which is the honest baseline that measurement needs.
 */
function cacheHintFor(source: DeckSource): { cacheTtl: number; cacheEverything: boolean } {
  return source === 'moxfield'
    ? { cacheTtl: 0, cacheEverything: false }
    : { cacheTtl: UPSTREAM_CACHE_TTL_SECONDS, cacheEverything: true };
}

/**
 * Turn a site's response into a deck.
 *
 * No two sources agree on what a deck looks like: Archidekt sends a JSON
 * document, TappedOut and MTGGoldfish send text (and disagree about how a
 * sideboard is marked), and an EDHREC deck preview is an HTML page with its data
 * riding inside it. Keeping every one of those differences here means everything
 * on either side of this function — the proxying, the error handling, the
 * client — deals in one `ImportedDeck`.
 */
async function readDeck(ref: DeckUrlRef, upstream: Response): Promise<ImportedDeck> {
  switch (ref.source) {
    case 'archidekt': {
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        throw new Error("Archidekt returned a response we couldn't read.");
      }
      return extractArchidektDeck(payload as Parameters<typeof extractArchidektDeck>[0]);
    }
    case 'tappedout':
      return extractTappedOutDeck(ref.deckId, await upstream.text());
    case 'mtggoldfish':
      return extractMtgGoldfishDeck(
        await upstream.text(),
        // The only place the deck's real name appears in this response.
        deckNameFromContentDisposition(upstream.headers.get('content-disposition')),
      );
    case 'edhrec':
      // A page, not an endpoint — the deck rides along inside it.
      return extractEdhrecDeckPreview(await upstream.text());
    case 'edhrec-average': {
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        throw new Error("EDHREC returned a response we couldn't read.");
      }
      return extractEdhrecAverageDeck(payload);
    }
    case 'moxfield': {
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        throw new Error("Moxfield returned a response we couldn't read.");
      }
      return extractMoxfieldDeck(payload as Parameters<typeof extractMoxfieldDeck>[0]);
    }
  }
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
