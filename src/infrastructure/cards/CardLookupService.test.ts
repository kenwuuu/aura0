import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardLookupService } from './CardLookupService';
import { CardApiClient, FetchListResult, LookupFailureReason } from './CardApiClient';
import { DeckLineItem } from '@/features/deck-manager/DeckListParser';
import { CardDataResult, ScryfallCard } from './types';

function makeClient(overrides: Partial<CardApiClient> = {}): CardApiClient {
  return {
    fetchImagesForList: vi.fn(),
    fetchByName: vi.fn(),
    fetchById: vi.fn(),
    ...overrides,
  } as unknown as CardApiClient;
}

function makeEntry(name: string): DeckLineItem {
  return { count: 1, name };
}

/** A client's run, with `failures` kept consistent with `failedItems` by construction. */
function makeRun(
  results: CardDataResult[],
  failedItems: DeckLineItem[] = [],
  reason: LookupFailureReason = 'not_found',
): FetchListResult {
  return {
    results,
    failedItems,
    failures: failedItems.map((item) => ({ item, reason })),
    printingMismatches: [],
    printingMisses: [],
  };
}

function makeResult(name: string, error?: string): CardDataResult {
  return {
    count: 1,
    name,
    scryfallId: error ? '' : `id-${name}`,
    imageUris: { front: null, back: null },
    error,
  };
}

function makeCard(name: string, allParts: ScryfallCard['all_parts'] = []): ScryfallCard {
  return { id: `id-${name}`, name, all_parts: allParts };
}

describe('CardLookupService — Aura -> Scryfall fallback policy', () => {
  describe('fetchImagesForList', () => {
    it('returns the primary run untouched when nothing failed, and never calls the fallback', async () => {
      const primaryRun = makeRun([makeResult('Sol Ring')]);
      const primary = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(primaryRun) });
      const fallback = makeClient();
      const service = new CardLookupService(primary, fallback);

      const result = await service.fetchImagesForList([makeEntry('Sol Ring')]);

      expect(result).toEqual({
        ...primaryRun,
        fallbackTriggeredCount: 0,
        fallbackRecoveredCount: 0,
        fallbackFailedCount: 0,
        auraFailures: [],
      });
      expect(fallback.fetchImagesForList).not.toHaveBeenCalled();
    });

    it('hands only the failed items to the fallback and merges successes from both', async () => {
      const primaryRun = makeRun(
        [makeResult('Sol Ring'), makeResult('Obscure Card', 'not found')],
        [makeEntry('Obscure Card')],
      );
      const fallbackRun = makeRun([makeResult('Obscure Card')]);
      const primary = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(primaryRun) });
      const fallback = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(fallbackRun) });
      const service = new CardLookupService(primary, fallback);

      const result = await service.fetchImagesForList([
        makeEntry('Sol Ring'),
        makeEntry('Obscure Card'),
      ]);

      expect(fallback.fetchImagesForList).toHaveBeenCalledWith(
        primaryRun.failedItems,
        undefined,
      );
      expect(result.fallbackTriggeredCount).toBe(1);
      expect(result.failedItems).toEqual(fallbackRun.failedItems);
      expect(result.results).toEqual([...fallbackRun.results, makeResult('Sol Ring')]);
    });

    it('reports items the fallback also could not resolve as failedItems', async () => {
      const primaryRun = makeRun(
        [makeResult('Obscure Card', 'not found')],
        [makeEntry('Obscure Card')],
      );
      const fallbackRun = makeRun(
        [makeResult('Obscure Card', 'still not found')],
        [makeEntry('Obscure Card')],
      );
      const primary = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(primaryRun) });
      const fallback = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(fallbackRun) });
      const service = new CardLookupService(primary, fallback);

      const result = await service.fetchImagesForList([makeEntry('Obscure Card')]);

      expect(result.failedItems).toEqual([makeEntry('Obscure Card')]);
      expect(result.fallbackTriggeredCount).toBe(1);
    });

    it('splits the fallback outcome into cards it recovered and cards nothing could resolve', async () => {
      // Aura misses two cards; Scryfall saves one and loses the other. Without the
      // split, both look identical from analytics — but one is a coverage gap in
      // our index and the other is a card the player actually never gets.
      const primaryRun = makeRun(
        [
          makeResult('Sol Ring'),
          makeResult('Recovered Card', 'not found'),
          makeResult('Doomed Card', 'not found'),
        ],
        [makeEntry('Recovered Card'), makeEntry('Doomed Card')],
      );
      const fallbackRun = makeRun(
        [makeResult('Recovered Card'), makeResult('Doomed Card', 'still not found')],
        [makeEntry('Doomed Card')],
      );
      const primary = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(primaryRun) });
      const fallback = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(fallbackRun) });
      const service = new CardLookupService(primary, fallback);

      const result = await service.fetchImagesForList([
        makeEntry('Sol Ring'),
        makeEntry('Recovered Card'),
        makeEntry('Doomed Card'),
      ]);

      expect(result.fallbackTriggeredCount).toBe(2);
      expect(result.fallbackRecoveredCount).toBe(1);
      expect(result.fallbackFailedCount).toBe(1);
    });
  });

  describe('exact printings Aura has not indexed yet', () => {
    // The Discord report: `Soul Warden (sld) 2435` imported with the default art.
    // Aura's index predates that Secret Lair drop, so the printing 404s, the
    // name resolves, and — because that's a success — Scryfall was never asked.
    const AURA = 'https://aura.test';
    const SCRYFALL = 'https://scryfall.test';
    const sld = (name: string, collectorNumber: string): DeckLineItem => ({
      count: 1, name, setCode: 'sld', collectorNumber,
    });
    const json = (body: object): Response =>
      ({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as Response;
    const notFound = (): Response =>
      ({ ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), json: async () => ({}) }) as Response;

    function realClients() {
      const rateLimit = { interval: 10, intervalCap: 100, throttleBackoffMs: 1 };
      const aura = new CardApiClient({
        name: 'aura', baseUrl: AURA, rateLimit,
        endpoints: {
          byId: (id) => `${AURA}/cards/${id}`,
          byName: (name) => `${AURA}/cards/${encodeURIComponent(name)}`,
          bySet: (set, num) => `${AURA}/cards/${set}${num}`,
        },
      });
      const scryfall = new CardApiClient({
        name: 'scryfall', baseUrl: SCRYFALL, rateLimit,
        endpoints: {
          byId: (id) => `${SCRYFALL}/cards/${id}`,
          byName: (name) => `${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`,
          bySet: (set, num) => `${SCRYFALL}/cards/${set}/${num}/en`,
        },
      });
      return new CardLookupService(aura, scryfall);
    }

    afterEach(() => vi.unstubAllGlobals());

    it('asks Scryfall for the exact printing and imports its art', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === `${AURA}/cards/sld2435`) return notFound();
        if (url === `${AURA}/cards/Soul%20Warden`) return json({ id: 'default-printing', name: 'Soul Warden' });
        if (url === `${SCRYFALL}/cards/sld/2435/en`) return json({ id: 'sld-2435', name: 'Soul Warden' });
        throw new Error(`unexpected fetch ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await realClients().fetchImagesForList([sld('Soul Warden', '2435')]);

      expect(result.results.map((r) => r.scryfallId)).toEqual(['sld-2435']);
      expect(result.printingMisses).toEqual([]);
      // A recovered printing isn't a failed card — the fallback counters stay clean.
      expect(result.fallbackTriggeredCount).toBe(0);
    });

    it('keeps the name-resolved card when Scryfall has no such printing either', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === `${AURA}/cards/Soul%20Warden`) return json({ id: 'default-printing', name: 'Soul Warden' });
        return notFound();
      }));

      const result = await realClients().fetchImagesForList([sld('Soul Warden', '99999')]);

      expect(result.results.map((r) => r.scryfallId)).toEqual(['default-printing']);
      expect(result.failedItems).toEqual([]);
    });

    it('keeps the name-resolved card when that printing is a different card on Scryfall', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === `${AURA}/cards/sld2435`) return notFound();
        if (url === `${AURA}/cards/Soul%20Warden`) return json({ id: 'default-printing', name: 'Soul Warden' });
        if (url === `${SCRYFALL}/cards/sld/2435/en`) return json({ id: 'other', name: 'Smart Ass' });
        throw new Error(`unexpected fetch ${url}`);
      }));

      const result = await realClients().fetchImagesForList([sld('Soul Warden', '2435')]);

      expect(result.results.map((r) => r.scryfallId)).toEqual(['default-printing']);
    });

    it('never asks Scryfall when Aura has the printing', async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url === `${AURA}/cards/sld1`) return json({ id: 'sld-1', name: 'Snow-Covered Plains' });
        throw new Error(`unexpected fetch ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await realClients().fetchImagesForList([sld('Snow-Covered Plains', '1')]);

      expect(result.results.map((r) => r.scryfallId)).toEqual(['sld-1']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchCardByName', () => {
    it('returns the primary card without touching the fallback when the primary resolves', async () => {
      const card = makeCard('Lightning Bolt');
      const primary = makeClient({ fetchByName: vi.fn().mockResolvedValue(card) });
      const fallback = makeClient();
      const service = new CardLookupService(primary, fallback);

      await expect(service.fetchCardByName('Lightning Bolt')).resolves.toBe(card);
      expect(fallback.fetchByName).not.toHaveBeenCalled();
    });

    it('falls back to the secondary client when the primary throws', async () => {
      const card = makeCard('Lightning Bolt');
      const primary = makeClient({ fetchByName: vi.fn().mockRejectedValue(new Error('down')) });
      const fallback = makeClient({ fetchByName: vi.fn().mockResolvedValue(card) });
      const service = new CardLookupService(primary, fallback);

      await expect(service.fetchCardByName('Lightning Bolt')).resolves.toBe(card);
      expect(fallback.fetchByName).toHaveBeenCalledWith('Lightning Bolt');
    });
  });

  describe('fetchCardById', () => {
    it('always goes straight to the fallback (Scryfall), skipping the primary entirely', async () => {
      const card = makeCard('Lightning Bolt');
      const primary = makeClient();
      const fallback = makeClient({ fetchById: vi.fn().mockResolvedValue(card) });
      const service = new CardLookupService(primary, fallback);

      await expect(service.fetchCardById('abc-123')).resolves.toBe(card);
      expect(fallback.fetchById).toHaveBeenCalledWith('abc-123');
      expect(primary.fetchById).not.toHaveBeenCalled();
    });
  });

  describe('extractTokenIds', () => {
    it('returns the ids of only the token-component related parts', () => {
      const service = new CardLookupService(makeClient(), makeClient());
      const card = makeCard('Elspeth, Sun\'s Champion', [
        { id: 'tok-1', component: 'token', name: 'Soldier', uri: 'x' },
        { id: 'combo-1', component: 'combo_piece', name: 'Some Other Card', uri: 'x' },
        { id: 'tok-2', component: 'token', name: 'Soldier', uri: 'x' },
      ]);

      expect(service.extractTokenIds(card)).toEqual(['tok-1', 'tok-2']);
    });

    it('returns an empty array when the card has no all_parts', () => {
      const service = new CardLookupService(makeClient(), makeClient());
      expect(service.extractTokenIds(makeCard('Sol Ring'))).toEqual([]);
    });
  });

  describe('createCardDataResult', () => {
    it('adapts a ScryfallCard into a CardDataResult with a count of 1', () => {
      const service = new CardLookupService(makeClient(), makeClient());
      const card = makeCard('Sol Ring');

      expect(service.createCardDataResult(card)).toEqual({
        count: 1,
        name: 'Sol Ring',
        type_line: undefined,
        oracleText: undefined,
        scryfallId: 'id-Sol Ring',
        imageUris: { front: null, back: null },
      });
    });
  });
});
