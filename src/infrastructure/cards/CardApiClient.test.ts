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
