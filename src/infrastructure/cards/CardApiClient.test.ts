import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardApiClient, CardApiClientConfig } from './CardApiClient';
import { DeckLineItem } from '@/features/deck-manager/DeckListParser';

const CONFIG: CardApiClientConfig = {
  name: 'test',
  baseUrl: 'https://cards.test',
  rateLimit: { interval: 10, intervalCap: 100 },
  endpoints: {
    byId: (id) => `https://cards.test/cards/${id}`,
    byName: (name) => `https://cards.test/cards/${encodeURIComponent(name)}`,
    bySet: (setCode, collectorNumber) =>
      `https://cards.test/cards/${setCode}${collectorNumber}`,
  },
};

const entry = (name: string): DeckLineItem => ({ count: 1, name });

function httpResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => ({ id: 'card-id', name: 'Sol Ring' }),
  } as Response;
}

/** `retries: 0` keeps pRetry from sleeping between attempts. */
const lookupOnce = (client: CardApiClient, name: string) =>
  client.fetchImagesForList([entry(name)], undefined, 0);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CardApiClient — why a lookup failed', () => {
  it('reports no failures when the card resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(200)));

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Sol Ring');

    expect(result.failures).toEqual([]);
    expect(result.failedItems).toEqual([]);
  });

  it('classifies a 404 as not_found — the backend answered, the card is not indexed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(404)));

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Nonexistent Card');

    expect(result.failures).toEqual([
      { item: entry('Nonexistent Card'), reason: 'not_found', status: 404 },
    ]);
  });

  it('classifies a 429 as rate_limited, not as a missing card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(429)));

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Sol Ring');

    expect(result.failures[0]).toMatchObject({ reason: 'rate_limited', status: 429 });
  });

  it('classifies a 5xx as server_error, not as a missing card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(503)));

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Sol Ring');

    expect(result.failures[0]).toMatchObject({ reason: 'server_error', status: 503 });
  });

  it('classifies a readable 403 as blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(403)));

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Sol Ring');

    expect(result.failures[0]).toMatchObject({ reason: 'blocked', status: 403 });
  });

  // The regression guard for the July 2026 incident. Cloudflare served a bot
  // challenge on the card API; the 403 carried no CORS header, so the browser
  // rejected it before JS could read a status and `fetch` rejected with a
  // TypeError. The old client mapped every throw to "lookup failed", which the
  // analytics layer then reported as an Aura *index miss* — sending us hunting for
  // a culprit card while the real cause was that requests never arrived at all.
  it('classifies a CORS-blocked fetch as network_or_blocked, never as not_found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const result = await lookupOnce(new CardApiClient(CONFIG), 'Sol Ring');

    expect(result.failures[0].reason).toBe('network_or_blocked');
    expect(result.failures[0].reason).not.toBe('not_found');
    // No status: a blocked response is opaque to JS.
    expect(result.failures[0].status).toBeUndefined();
  });

  it('reports the name lookup’s reason when a set lookup falls back to it and both fail', async () => {
    // bySet 404s (wrong collector number), then byName is rate-limited. The reason
    // that decided the outcome is the second one.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpResponse(404))
      .mockResolvedValueOnce(httpResponse(429));
    vi.stubGlobal('fetch', fetchMock);

    const client = new CardApiClient(CONFIG);
    const result = await client.fetchImagesForList(
      [{ count: 1, name: 'Sol Ring', setCode: 'ltc', collectorNumber: '284' }],
      undefined,
      0,
    );

    expect(result.failures[0]).toMatchObject({ reason: 'rate_limited', status: 429 });
  });
});

/**
 * A wrong printing does not fail — it succeeds with a different card, and every
 * layer downstream treats that as a clean import. `1 Erase (Not the Urza's
 * Legacy One) (UNH) 45` resolves to Smart Ass, because UNH 45 is Smart Ass.
 */
describe('CardApiClient — when the printing and the name disagree', () => {
  /** A 200 carrying a specific card name, so agreement can actually be tested. */
  function card(name: string): Response {
    return {
      ok: true,
      status: 200,
      statusText: 'status 200',
      json: async () => ({ id: `id-${name}`, name }),
    } as Response;
  }

  const printed = (name: string): DeckLineItem => ({
    count: 1,
    name,
    setCode: 'unh',
    collectorNumber: '45',
  });

  const lookup = (client: CardApiClient, item: DeckLineItem) =>
    client.fetchImagesForList([item], undefined, 0);

  it('keeps the printing when it is the card the line named', async () => {
    const fetchMock = vi.fn().mockResolvedValue(card('Erase (Not the Urza’s Legacy One)'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookup(new CardApiClient(CONFIG), printed('Erase (Not the Urza’s Legacy One)'));

    expect(result.results[0].name).toBe('Erase (Not the Urza’s Legacy One)');
    // One request: the printing answered and was believed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefers the name when the printing resolves to a different card', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(card('Smart Ass'))
      .mockResolvedValueOnce(card('Erase (Not the Urza’s Legacy One)'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookup(new CardApiClient(CONFIG), printed('Erase (Not the Urza’s Legacy One)'));

    expect(result.results[0].name).toBe('Erase (Not the Urza’s Legacy One)');
    expect(result.failedItems).toEqual([]);
  });

  // The API answers a double-faced lookup with the full "A // B" name while the
  // entry carries only the front face. Reading that as a disagreement would send
  // every DFC on a pointless second round trip and lose its exact printing.
  it('does not read a double-faced name as a disagreement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(card('Brazen Borrower // Petty Theft'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookup(new CardApiClient(CONFIG), printed('Brazen Borrower'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results[0].name).toBe('Brazen Borrower // Petty Theft');
  });

  it('does not read a dropped accent as a disagreement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(card('Lim-Dûl’s Vault'));
    vi.stubGlobal('fetch', fetchMock);

    await lookup(new CardApiClient(CONFIG), printed('Lim-Dul’s Vault'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The shape a renamed card takes: the name on the list is dead, the printing
   * is not. Failing here would lose a card we are holding in our hand.
   */
  it('falls back to the mismatched printing when no card has that name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(card('Smart Ass'))
      .mockResolvedValueOnce(httpResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookup(new CardApiClient(CONFIG), printed('A Name That No Longer Exists'));

    expect(result.results[0].name).toBe('Smart Ass');
    expect(result.failedItems).toEqual([]);
  });
});
