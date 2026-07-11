import { describe, expect, it, vi } from 'vitest';
import { CardLookupService } from './CardLookupService';
import { CardApiClient, FetchListResult } from './CardApiClient';
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
      const primaryRun: FetchListResult = {
        results: [makeResult('Sol Ring')],
        failedItems: [],
      };
      const primary = makeClient({ fetchImagesForList: vi.fn().mockResolvedValue(primaryRun) });
      const fallback = makeClient();
      const service = new CardLookupService(primary, fallback);

      const result = await service.fetchImagesForList([makeEntry('Sol Ring')]);

      expect(result).toEqual({
        ...primaryRun,
        fallbackTriggeredCount: 0,
        fallbackRecoveredCount: 0,
        fallbackFailedCount: 0,
      });
      expect(fallback.fetchImagesForList).not.toHaveBeenCalled();
    });

    it('hands only the failed items to the fallback and merges successes from both', async () => {
      const primaryRun: FetchListResult = {
        results: [makeResult('Sol Ring'), makeResult('Obscure Card', 'not found')],
        failedItems: [makeEntry('Obscure Card')],
      };
      const fallbackRun: FetchListResult = {
        results: [makeResult('Obscure Card')],
        failedItems: [],
      };
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
      const primaryRun: FetchListResult = {
        results: [makeResult('Obscure Card', 'not found')],
        failedItems: [makeEntry('Obscure Card')],
      };
      const fallbackRun: FetchListResult = {
        results: [makeResult('Obscure Card', 'still not found')],
        failedItems: [makeEntry('Obscure Card')],
      };
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
      const primaryRun: FetchListResult = {
        results: [
          makeResult('Sol Ring'),
          makeResult('Recovered Card', 'not found'),
          makeResult('Doomed Card', 'not found'),
        ],
        failedItems: [makeEntry('Recovered Card'), makeEntry('Doomed Card')],
      };
      const fallbackRun: FetchListResult = {
        results: [makeResult('Recovered Card'), makeResult('Doomed Card', 'still not found')],
        failedItems: [makeEntry('Doomed Card')],
      };
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
