import { DeckLineItem } from '@/features/deck-manager/DeckListParser';
import { CardApiClient, FetchListResult } from './CardApiClient';
import { createAuraClient, createScryfallClient } from './clients';
import { toCardDataResult } from './ScryfallCardAdapter';
import { CardDataResult, ScryfallCard } from './types';

export type LookupListResult = FetchListResult & {
  /** How many items the primary client couldn't resolve and got handed to the fallback. */
  fallbackTriggeredCount: number;
};

/**
 * Orchestrates card lookups across the Aura backend and Scryfall.
 *
 * Policy: try the Aura backend first; for any items it can't resolve,
 * fall back to Scryfall. This is the single entry point for both deck
 * import and ad-hoc lookups so the fallback behavior lives in one place.
 */
export class CardLookupService {
  private readonly primary: CardApiClient;
  private readonly fallback: CardApiClient;

  constructor(
    primary: CardApiClient = createAuraClient(),
    fallback: CardApiClient = createScryfallClient(),
  ) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async fetchImagesForList(
    entries: DeckLineItem[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<LookupListResult> {
    const primaryRun = await this.primary.fetchImagesForList(entries, onProgress);

    if (primaryRun.failedItems.length === 0) {
      return { ...primaryRun, fallbackTriggeredCount: 0 };
    }

    const fallbackTriggeredCount = primaryRun.failedItems.length;
    const fallbackRun = await this.fallback.fetchImagesForList(
      primaryRun.failedItems,
      onProgress,
    );

    // Drop the failure placeholders the primary client emitted for items the
    // fallback re-attempted; keep its real successes, then prepend whatever
    // the fallback found (success or final error).
    const primarySuccesses = primaryRun.results.filter((r) => !r.error);

    return {
      results: [...fallbackRun.results, ...primarySuccesses],
      failedItems: fallbackRun.failedItems,
      fallbackTriggeredCount,
    };
  }

  async fetchCardByName(name: string): Promise<ScryfallCard> {
    try {
      return await this.primary.fetchByName(name);
    } catch {
      return await this.fallback.fetchByName(name);
    }
  }

  async fetchCardById(scryfallId: string): Promise<ScryfallCard> {
    return await this.fallback.fetchById(scryfallId);
  }

  /**
   * Extract Scryfall IDs of any tokens this card creates.
   */
  extractTokenIds(card: ScryfallCard): string[] {
    if (!card.all_parts || !Array.isArray(card.all_parts)) {
      return [];
    }
    return card.all_parts
      .filter((part) => part.component === 'token')
      .map((part) => part.id);
  }

  createCardDataResult(card: ScryfallCard): CardDataResult {
    return toCardDataResult(card, 1);
  }
}
