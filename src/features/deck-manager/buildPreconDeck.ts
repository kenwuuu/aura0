import { CardLookupService, fromCardDataResult } from '@/infrastructure/cards';
import { PreconList } from '@/infrastructure/precons';
import { Card, SavedDeck } from '@/features/player/types';
import { DeckLineItem } from './DeckListParser';

export interface PreconDeckResult {
  deck: SavedDeck;
  /** Names of any cards neither Aura nor Scryfall could resolve (usually none). */
  missingCards: string[];
}

/**
 * Hydrate a precon list into a ready-to-load `SavedDeck`.
 *
 * The precon entries already carry the exact printing (set + collector number),
 * so this reuses the deck-import back half unchanged: the bulk resolver fetches
 * every card in one request (Scryfall by set+collector for any Aura miss), and
 * `fromCardDataResult` builds the same `Card` shape a text import produces.
 *
 * The resulting deck is ephemeral — it's handed straight to `loadDeck` and is
 * NOT written to the saved-deck library. Its id is namespaced (`precon:<id>`) so
 * it can never collide with a user deck.
 */
export async function buildPreconDeck(
  list: PreconList,
  cardLookup: CardLookupService = new CardLookupService(),
  onProgress?: (current: number, total: number) => void,
): Promise<PreconDeckResult> {
  const entries: DeckLineItem[] = list.cards.map((c) => ({
    count: c.quantity,
    name: c.name,
    setCode: c.setCode,
    collectorNumber: c.collectorNumber,
    ...(c.commander ? { commander: true } : {}),
  }));

  const lookup = await cardLookup.resolveDeckListBulk(entries, onProgress);

  const cards: Card[] = [];
  const missingCards: string[] = [];
  let cardNumber = 1;

  for (const result of lookup.results) {
    if (result.error) {
      missingCards.push(result.name);
      continue;
    }
    // Expand quantity into individual cards, each with a stable running number
    // (basics arrive as one result with count > 1).
    for (let i = 0; i < result.count; i++) {
      cards.push(fromCardDataResult(result, { cardNumber: cardNumber++ }));
    }
  }

  const now = new Date();
  const deck: SavedDeck = {
    metadata: {
      id: `precon:${list.id}`,
      name: list.name,
      format: 'commander',
      source: 'precon',
      cardCount: cards.length,
      importedAt: now,
      lastModified: now,
    },
    cards,
  };

  return { deck, missingCards };
}
