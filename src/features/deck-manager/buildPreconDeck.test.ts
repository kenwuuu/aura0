import { describe, it, expect, vi } from 'vitest';
import { buildPreconDeck } from './buildPreconDeck';
import type { PreconList } from '@/infrastructure/precons';
import type { CardLookupService } from '@/infrastructure/cards';
import type { CardDataResult } from '@/infrastructure/cards';

const img = { front: null, back: null };

function fakeLookup(results: CardDataResult[]) {
  const resolveDeckListBulk = vi.fn().mockResolvedValue({
    results,
    failedItems: [],
    failures: [],
    fallbackTriggeredCount: 0,
    fallbackRecoveredCount: 0,
    fallbackFailedCount: 0,
    auraFailures: [],
  });
  return { service: { resolveDeckListBulk } as unknown as CardLookupService, resolveDeckListBulk };
}

const LIST: PreconList = {
  id: 'abzan-armor-tarkir-dragonstorm-commander',
  name: 'Abzan Armor',
  set: 'Tarkir Dragonstorm Commander',
  cards: [
    { quantity: 1, name: 'Felothar', setCode: 'tdc', collectorNumber: '4', scryfallId: 'id-fel', commander: true },
    { quantity: 5, name: 'Forest', setCode: 'tdc', collectorNumber: '110', scryfallId: 'id-for', commander: false },
  ],
};

const RESULTS: CardDataResult[] = [
  { count: 1, name: 'Felothar', type_line: 'Legendary Creature', scryfallId: 'id-fel', imageUris: img, commander: true },
  { count: 5, name: 'Forest', type_line: 'Basic Land — Forest', scryfallId: 'id-for', imageUris: img },
  { count: 1, name: 'Broken Card', scryfallId: '', imageUris: img, error: 'lookup failed' },
];

describe('buildPreconDeck', () => {
  it('expands quantities and skips unresolved cards', async () => {
    const { service } = fakeLookup(RESULTS);
    const { deck, missingCards } = await buildPreconDeck(LIST, service);

    expect(deck.cards).toHaveLength(6); // 1 Felothar + 5 Forest; broken card dropped
    expect(missingCards).toEqual(['Broken Card']);
    expect(deck.cards.filter((c) => c.commander).map((c) => c.name)).toEqual(['Felothar']);
    // cardNumbers are unique and sequential.
    expect(deck.cards.map((c) => c.cardNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(deck.cards.map((c) => c.id)).size).toBe(6);
  });

  it('builds ephemeral precon metadata (namespaced id, precon source, commander format)', async () => {
    const { service } = fakeLookup(RESULTS);
    const { deck } = await buildPreconDeck(LIST, service);

    expect(deck.metadata).toMatchObject({
      id: 'precon:abzan-armor-tarkir-dragonstorm-commander',
      name: 'Abzan Armor',
      format: 'commander',
      source: 'precon',
      cardCount: 6,
    });
    expect(deck.sideboard).toBeUndefined();
  });

  it('maps precon entries to DeckLineItems (count from quantity, commander flag)', async () => {
    const { service, resolveDeckListBulk } = fakeLookup(RESULTS);
    await buildPreconDeck(LIST, service);

    expect(resolveDeckListBulk).toHaveBeenCalledTimes(1);
    const [entries] = resolveDeckListBulk.mock.calls[0];
    expect(entries).toEqual([
      { count: 1, name: 'Felothar', setCode: 'tdc', collectorNumber: '4', commander: true },
      { count: 5, name: 'Forest', setCode: 'tdc', collectorNumber: '110' },
    ]);
  });
});
