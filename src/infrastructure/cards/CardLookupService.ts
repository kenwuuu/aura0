import { DeckLineItem } from '@/features/deck-manager/DeckListParser';
import { CardApiClient, FetchListResult, LookupFailure } from './CardApiClient';
import { createAuraClient, createScryfallClient } from './clients';
import { toCardDataResult } from './ScryfallCardAdapter';
import { CardDataResult, ScryfallCard } from './types';

export type LookupListResult = FetchListResult & {
  /** How many items the primary client couldn't resolve and got handed to the fallback. */
  fallbackTriggeredCount: number;
  /**
   * Of those, how many the fallback then resolved. `triggered - recovered - failed === 0`.
   *
   * Reporting the trigger alone can't distinguish "Aura missed it, Scryfall
   * saved it" (a silent recovery — the user never notices) from "neither backend
   * had it" (a card the user actually loses). Those are different problems: the
   * first is an Aura index-coverage gap, the second is a dead card. Splitting the
   * outcome is what makes the fallback's recovery rate a real proportion.
   */
  fallbackRecoveredCount: number;
  /** Of those handed to the fallback, how many it also failed to resolve. */
  fallbackFailedCount: number;
  /**
   * Every item the primary (Aura) client couldn't resolve, and why.
   *
   * The counts above say *how many* Aura missed; this says *which cards* and
   * *for what reason*. Without it, a 404 (the card really isn't indexed) and a
   * blocked request (the backend never answered) are the same number — which is
   * exactly how a Cloudflare outage spent a month being read as an index gap.
   */
  auraFailures: LookupFailure[];
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
      return {
        ...primaryRun,
        fallbackTriggeredCount: 0,
        fallbackRecoveredCount: 0,
        fallbackFailedCount: 0,
        auraFailures: [],
      };
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

    const fallbackFailedCount = fallbackRun.failedItems.length;

    return {
      results: [...fallbackRun.results, ...primarySuccesses],
      failedItems: fallbackRun.failedItems,
      failures: fallbackRun.failures,
      fallbackTriggeredCount,
      fallbackRecoveredCount: fallbackTriggeredCount - fallbackFailedCount,
      fallbackFailedCount,
      auraFailures: primaryRun.failures,
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
