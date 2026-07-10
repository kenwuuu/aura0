import { DeckImporter, DeckImportResult } from './DeckImporter';
import { DeckLineItem, parseDecklist, validateFormat } from "@/features/deck-manager/DeckListParser";
import { CardDataResult, CardLookupService, fromCardDataResult } from '@/infrastructure/cards';
import { Card } from '@/features/player';
import * as Sentry from "@sentry/browser";
import {
  trackImportStarted,
  trackImportFailed,
  trackFallbackTriggered,
  trackImportSucceeded,
  trackImportPartialFailure,
} from "@/infrastructure/analytics/PosthogFunctions";

export class MtgTextListDeckImporter extends DeckImporter {
  private readonly cardLookup: CardLookupService;
  private readonly onProgress?: (current: number, total: number) => void;

  constructor(
    onProgress?: (current: number, total: number) => void,
    cardLookup: CardLookupService = new CardLookupService(),
  ) {
    super();
    this.cardLookup = cardLookup;
    this.onProgress = onProgress;
  }

  /**
   * Import deck from Scryfall-formatted text
   */
  public async importFromText(text: string): Promise<DeckImportResult> {
    const startTime = Date.now();
    trackImportStarted(text);

    let deck: DeckImportResult = {
      cards: [],
      metadata: {},
    }

    if (!validateFormat(text)) {
      deck.errors = ["Invalid deck format. Expected format: \"[count] [card name]\" per line"];
      trackImportFailed('invalid_format');
      return deck;
    }

    // Section headers are tolerated: parseDecklist imports the command zone and
    // main deck while dropping non-main sections (sideboard, maybeboard, …).
    let entries: DeckLineItem[] = [];

    try {
      entries = parseDecklist(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deck.errors = [`Failed to parse decklist: ${message}`];
      trackImportFailed('parse_error', { message });
      Sentry.captureException(e, {
        level: "error",
        extra: { stage: "parseDecklist", text },
      });
      return deck;
    }

    if (entries.length === 0) {
      deck.errors = ["No valid card entries found. Make sure each line starts with a quantity, e.g. \"4 Lightning Bolt\"."];
      trackImportFailed('no_valid_entries');
      return deck;
    }

    let results: CardDataResult[];
    try {
      const lookup = await this.cardLookup.fetchImagesForList(entries, this.onProgress);
      results = lookup.results;
      if (lookup.fallbackTriggeredCount > 0) {
        trackFallbackTriggered(lookup.fallbackTriggeredCount, entries.length);
      }
    } catch (e) {
      // Unexpected throw from fetchImagesForList itself (not per-card errors,
      // which are returned as CardDataResult.error — this is a catastrophic failure)
      const message = e instanceof Error ? e.message : String(e);
      deck.errors = [`Card data fetch failed: ${message}. Please try again.`];
      trackImportFailed('fetch_catastrophic_failure', { message });
      Sentry.captureException(e, {
        level: "error",
        extra: { stage: "fetchImagesForList", entries },
      });
      return deck;
    }

    // Build deck and collect per-card errors
    this.parseResultsIntoDeck(deck, results);

    deck.metadata = {
      source: 'scryfall',
      cardCount: deck.cards.length,
      importedAt: new Date(),
      lastModified: new Date(),
    };

    const durationMs = Date.now() - startTime;

    // Report partial failures to Sentry with structured context
    if (deck.errors && deck.errors.length > 0) {
      const failedCards = results
        .filter(r => r.error)
        .map(r => ({ name: r.name, error: r.error }));

      trackImportPartialFailure({
        totalRequested: entries.length,
        totalImported: deck.cards.length,
        totalFailed: failedCards.length,
        durationMs,
      });

      Sentry.captureMessage("Partial deck import failure", {
        level: "warning",
        extra: {
          deckListRawString: text,
          stage: "parseResultsIntoDeck",
          totalRequested: entries.length,
          totalImported: deck.cards.length,
          totalFailed: failedCards.length,
          deckError: deck.errors,
          failedCards,
        },
      });
    } else {
      trackImportSucceeded({
        cardCount: deck.cards.length,
        uniqueCardCount: results.length,
        durationMs,
      });
    }

    return deck;
  }

  private parseResultsIntoDeck(deckImportResult: DeckImportResult, results: CardDataResult[]) {
    let cardNumberCounter = 1;

    for (const result of results) {
      if (result.error) {
        if (!deckImportResult.errors) {
          deckImportResult.errors = [];
        }
        deckImportResult.errors.push(`${result.name}: ${result.error}`);
        continue;
      }

      console.log(`Importing ${result.count}x ${result.name}`);

      for (let i = 0; i < result.count; i++) {
        const card: Card = fromCardDataResult(result, { cardNumber: cardNumberCounter++ });
        deckImportResult.cards.push(card);
      }
    }
  }
}