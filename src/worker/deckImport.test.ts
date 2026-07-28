import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckImportEnv, handleDeckImport } from './deckImport';

/**
 * These cover the seam between this Worker and the *separate* Worker that hosts
 * the rate gate (`workers/moxfield-gate/`). That seam can fail in ways an
 * in-process binding could not — the gate Worker can be undeployed, deleted, or
 * simply not running next to `wrangler dev` — and the only safe reading of an
 * unreachable gate is "do not send". We cannot show we are under Moxfield's
 * one-per-second cap, and the penalty for breaching it is the credential being
 * revoked for every player.
 *
 * So the property under test is not "returns a tidy error". It is **the upstream
 * request never happens.**
 */
const MOXFIELD_URL = 'https://www.moxfield.com/decks/j-0aJlxuOUm9FnKRvJcfZw';

/**
 * Build a request the endpoint will treat as first-party.
 *
 * Hand-rolled rather than `new Request(url, { headers })` because `Sec-Fetch-Site`
 * is a **forbidden header name**: the Fetch spec bars scripts from setting any
 * `Sec-*` header, so the constructor silently drops it and every request here
 * would arrive looking cross-origin.
 *
 * That restriction is the reason the check is worth having. Only the user agent
 * can set this header, so no amount of JavaScript on another origin can forge
 * it — the check is airtight against browser-based abuse, and merely absent for
 * non-browser clients like curl, which is exactly the trade documented in
 * `isFirstPartyRequest`.
 */
function request(url = MOXFIELD_URL, headers: Record<string, string> = {}): Request {
  const all = new Map(
    Object.entries({ 'sec-fetch-site': 'same-origin', ...headers }).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );

  return {
    method: 'GET',
    url: `https://aura0.app/api/deck-import?url=${encodeURIComponent(url)}`,
    headers: { get: (name: string) => all.get(name.toLowerCase()) ?? null },
  } as unknown as Request;
}

/** A gate binding whose Durable Object answers with whatever `respond` returns. */
function gateThat(respond: () => Response | Promise<Response>): DeckImportEnv['MOXFIELD_GATE'] {
  return {
    idFromName: () => ({}),
    get: () => ({ fetch: async () => respond() }),
  };
}

const CREDENTIALED: Pick<DeckImportEnv, 'MOXFIELD_USER_AGENT'> = {
  MOXFIELD_USER_AGENT: 'MoxKey; test',
};

describe('handleDeckImport — the gate seam', () => {
  let upstream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upstream = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'the gate Worker is not running (plain-text error, not JSON)',
      gateThat(() => new Response('Worker "aura0-moxfield-gate" is not running', { status: 503 })),
    ],
    [
      'the gate throws',
      gateThat(() => {
        throw new Error('no such script');
      }),
    ],
    [
      'the gate answers with a shape we do not recognize',
      gateThat(() => Response.json({ granted: 'yes please' })),
    ],
    [
      'the gate claims a grant but omits the wait',
      gateThat(() => Response.json({ granted: true })),
    ],
  ])('declines without contacting Moxfield when %s', async (_label, MOXFIELD_GATE) => {
    const response = await handleDeckImport(request(), { ...CREDENTIALED, MOXFIELD_GATE });

    expect(response.status).toBe(429);
    // The property that matters: no request went out under our credential.
    expect(upstream).not.toHaveBeenCalled();
  });

  it('declines when there is no gate binding at all', async () => {
    const response = await handleDeckImport(request(), CREDENTIALED);

    expect(response.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  /** A 500 with a stack trace is what this used to do, and it reached the dialog. */
  it('never leaks internals into the response body', async () => {
    const response = await handleDeckImport(request(), {
      ...CREDENTIALED,
      MOXFIELD_GATE: gateThat(() => new Response('Worker is not running', { status: 503 })),
    });

    const body = await response.text();
    expect(body).not.toMatch(/SyntaxError|at async|file:\/\/\//);
    expect(JSON.parse(body)).toMatchObject({ reason: 'import_queue_busy' });
  });

  /**
   * Every failure a player can reach carries a reason and something to try, not
   * just a sentence. Without the fixes the only move left is to paste the same
   * link again, which for most of these fails identically forever (#174).
   */
  it('explains a failure with a reason and suggested fixes', async () => {
    const response = await handleDeckImport(request(), CREDENTIALED);
    const body = (await response.json()) as {
      error: string;
      reason: string;
      fixes: string[];
    };

    expect(body.reason).toBe('import_queue_busy');
    expect(body.error).toMatch(/Moxfield/);
    expect(body.fixes.length).toBeGreaterThan(0);
    // No status codes, no internals — this is what a player reads.
    expect(body.error).not.toMatch(/\b[45]\d\d\b|upstream|endpoint/i);
  });

  it('tells the caller how long to wait', async () => {
    const response = await handleDeckImport(request(), CREDENTIALED);

    expect(response.headers.get('retry-after')).toBe('1');
  });

  /**
   * The gate guards Moxfield alone. If an unreachable gate blocked the other four
   * sources too, one undeployed Worker would take out deck import entirely.
   */
  it('does not gate the sources that have no rate cap', async () => {
    upstream.mockResolvedValue(
      Response.json({ name: 'Group hugs', cards: [{ quantity: 1, card: { oracleCard: { name: 'Sol Ring' } } }] }),
    );

    const response = await handleDeckImport(
      request('https://archidekt.com/decks/24569510'),
      {}, // no gate, no credential
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  /**
   * A missing credential is a deployment fault. Sending anonymously would collect
   * a 403 that reads exactly like a private deck.
   */
  it('reports a missing credential as a configuration error, not a private deck', async () => {
    const response = await handleDeckImport(request(), {
      MOXFIELD_GATE: gateThat(() => Response.json({ granted: true, waitMs: 0 })),
    });

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  /**
   * The status a deck site answers with is not the status we answer with, and
   * two of those translations are load-bearing.
   *
   * A 429 from the site becomes a 502 from us, because a 429 *from* this
   * endpoint means something else entirely — our own gate shed the request and
   * a retry is worth waiting for (`fetchImportedDeck` acts on exactly that). Let
   * the site's 429 through and the client retries into a throttle it has no slot
   * in.
   */
  it.each([
    ['a deleted, mistyped or private deck', 404, 404, 'deck_not_found'],
    ['a deck the site refuses us', 403, 403, 'deck_private'],
    ['a deck behind a login', 401, 403, 'deck_private'],
    ['the site throttling us', 429, 502, 'source_rate_limited'],
    ['the site being down', 503, 502, 'source_unavailable'],
    ['the site erroring', 500, 502, 'source_unavailable'],
  ])('reports %s', async (_label, upstreamStatus, ourStatus, reason) => {
    upstream.mockResolvedValue(new Response('nope', { status: upstreamStatus }));

    const response = await handleDeckImport(request('https://archidekt.com/decks/24664944'), {});
    const body = (await response.json()) as { reason: string; fixes: string[]; detail?: string };

    expect(response.status).toBe(ourStatus);
    expect(body.reason).toBe(reason);
    expect(body.fixes.length).toBeGreaterThan(0);
    // The status a player would otherwise have had to read as the headline.
    expect(body.detail).toMatch(String(upstreamStatus));
  });

  /**
   * Deck `24664944` from #174: Archidekt 404s a private deck to anonymous
   * callers, so its owner sees it perfectly and we cannot. Telling that player
   * only "not found" is what sent them into three identical retries — the fix
   * they needed was the deck's visibility setting.
   */
  it('names the private-deck case in the fixes for a 404, not just "not found"', async () => {
    upstream.mockResolvedValue(new Response('{"error":"Deck not found."}', { status: 404 }));

    const response = await handleDeckImport(request('https://archidekt.com/decks/24664944'), {});
    const { fixes } = (await response.json()) as { fixes: string[] };

    expect(fixes.join(' ')).toMatch(/private/i);
    expect(fixes.join(' ')).toMatch(/public or unlisted/i);
  });

  /**
   * A player who fixes a deck and pastes the link again has to be able to see
   * the fix. Under the old 5-minute TTL the retry replayed the same broken
   * document — both #174 decks were retried inside a 277-second window, so every
   * attempt after the first was served from cache no matter what changed.
   */
  it('caches an upstream deck document only briefly', async () => {
    upstream.mockResolvedValue(
      Response.json({ name: 'x', cards: [{ quantity: 1, card: { oracleCard: { name: 'Sol Ring' } } }] }),
    );

    await handleDeckImport(request('https://archidekt.com/decks/24569510'), {});

    const { cf } = upstream.mock.calls[0][1] as { cf: { cacheTtl: number } };
    expect(cf.cacheTtl).toBeLessThanOrEqual(30);
  });

  it.each([
    ['cross-site', 'cross-site'],
    ['same-site but not same-origin', 'same-site'],
    ['absent (a non-browser client)', undefined],
  ])('turns away a %s request', async (_label, value) => {
    const req = request(MOXFIELD_URL, value === undefined ? {} : { 'sec-fetch-site': value });
    if (value === undefined) {
      // Strip the default the helper adds, to model a client that sends nothing.
      (req.headers as unknown as { get: (n: string) => string | null }).get = () => null;
    }

    const response = await handleDeckImport(req, CREDENTIALED);

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
