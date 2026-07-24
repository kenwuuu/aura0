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
    expect(JSON.parse(body).error).toMatch(/busy right now/i);
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
