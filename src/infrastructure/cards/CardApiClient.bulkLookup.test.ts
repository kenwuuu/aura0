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
    bySet: (setCode, cn) => `https://cards.test/cards/${setCode}${cn}`,
    bulk: () => 'https://cards.test/cards/bulk/lookup',
  },
};

const NO_BULK_CONFIG: CardApiClientConfig = { ...CONFIG, endpoints: { ...CONFIG.endpoints, bulk: undefined } };

function bulkResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

const entry = (over: Partial<DeckLineItem>): DeckLineItem => ({ count: 1, name: 'X', ...over });

afterEach(() => vi.unstubAllGlobals());

describe('CardApiClient.bulkLookup', () => {
  it('resolves keyable entries in one POST, mapping cards back by set+collector', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      bulkResponse({
        results: [
          { id: 'id-fel', name: 'Felothar', type_line: 'Legendary Creature', set: 'tdc', collector_number: '4' },
          { id: 'id-for', name: 'Forest', type_line: 'Basic Land — Forest', set: 'tdc', collector_number: '110' },
        ],
        not_found: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const entries = [
      entry({ name: 'Felothar', setCode: 'tdc', collectorNumber: '4', commander: true }),
      entry({ name: 'Forest', setCode: 'tdc', collectorNumber: '110', count: 5 }),
    ];
    const result = await new CardApiClient(CONFIG).bulkLookup(entries);

    // One batch request, POSTed with the normalized keys.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cards.test/cards/bulk/lookup');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ card_ids: ['tdc4', 'tdc110'] });

    expect(result.failedItems).toEqual([]);
    const felothar = result.results.find((r) => r.name === 'Felothar');
    const forest = result.results.find((r) => r.name === 'Forest');
    expect(felothar).toMatchObject({ commander: true, count: 1, scryfallId: 'id-fel' });
    expect(forest).toMatchObject({ count: 5, scryfallId: 'id-for' });
    // Non-legendary/no-commander stays off; commander only when legendary.
    expect(forest?.commander).toBeUndefined();
  });

  it('normalizes keys so case/space differences still match the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      bulkResponse({
        results: [{ id: 'id', name: 'Command Tower', set: 'tdc', collector_number: '107' }],
        not_found: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new CardApiClient(CONFIG).bulkLookup([
      entry({ name: 'Command Tower', setCode: 'TDC', collectorNumber: ' 107 ' }),
    ]);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ card_ids: ['tdc107'] });
    expect(result.results).toHaveLength(1);
    expect(result.failedItems).toEqual([]);
  });

  it('routes not_found entries to failedItems for the caller fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(bulkResponse({ results: [], not_found: ['tdc999'] })),
    );

    const missing = entry({ name: 'Missing', setCode: 'tdc', collectorNumber: '999' });
    const result = await new CardApiClient(CONFIG).bulkLookup([missing]);

    expect(result.results).toEqual([]);
    expect(result.failedItems).toEqual([missing]);
    expect(result.failures[0]).toMatchObject({ item: missing, reason: 'not_found' });
  });

  it('sends entries lacking set+collector straight to failedItems (never in the request)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(bulkResponse({ results: [], not_found: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const nameOnly = entry({ name: 'Just A Name' });
    const result = await new CardApiClient(CONFIG).bulkLookup([nameOnly]);

    // No keyable entries → no request at all.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failedItems).toEqual([nameOnly]);
  });

  it('hands the whole chunk to failedItems when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'err', json: async () => ({}) } as Response),
    );

    const e = entry({ name: 'Sol Ring', setCode: 'tdc', collectorNumber: '105' });
    const result = await new CardApiClient(CONFIG).bulkLookup([e]);

    expect(result.results).toEqual([]);
    expect(result.failedItems).toEqual([e]);
    expect(result.failures[0]).toMatchObject({ reason: 'server_error', status: 503 });
  });

  it('falls back entirely when the client has no bulk endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const e = entry({ name: 'Sol Ring', setCode: 'tdc', collectorNumber: '105' });
    const result = await new CardApiClient(NO_BULK_CONFIG).bulkLookup([e]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failedItems).toEqual([e]);
  });
});
