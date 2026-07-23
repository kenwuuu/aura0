import { DeckImporter, DeckImportResult } from './DeckImporter';
import {
  DeckLineItem,
  ParsedDecklist,
  isSideboardCard,
  parseDecklistWithStats,
  validateFormat,
} from "@/features/deck-manager/DeckListParser";
import { CardDataResult, CardLookupService, fromCardDataResult } from '@/infrastructure/cards';
import { Card } from '@/features/player';
import * as Sentry from "@sentry/browser";
import {
  ImportCounts,
  trackImportStarted,
  trackImportProgress,
  trackImportFailed,
  trackFallbackOutcome,
  trackPrintingMismatches,
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
      deck.errors = ["No cards found. Add one card per line, e.g. \"1 Sol Ring\" or just \"Sol Ring\"."];
      trackImportFailed('invalid_format', text);
      return deck;
    }

    // Section headers are tolerated: the parser imports the command zone and
    // main deck while dropping non-main sections (sideboard, maybeboard, …).
    let parsed: ParsedDecklist;

    try {
      parsed = parseDecklistWithStats(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deck.errors = [`Failed to parse decklist: ${message}`];
      trackImportFailed('parse_error', text, { message });
      Sentry.captureException(e, {
        level: "error",
        extra: { stage: "parseDecklist", text },
      });
      return deck;
    }

    const entries: DeckLineItem[] = parsed.items;

    if (entries.length === 0) {
      deck.errors = ["No valid card entries found. If your cards are all under a Sideboard or Maybeboard section, move them under a Deck or Commander section."];
      trackImportFailed('no_valid_entries', text);
      return deck;
    }

    // The deck size the list asks for. Compared against what we actually build,
    // this is what separates "they sent a short list" from "our lookup broke".
    // Sideboard cards are excluded on purpose: they are not part of the deck, so
    // counting them here would make every sideboarded list look over-sized.
    const requestedCardCount = entries.reduce((sum, entry) => sum + entry.count, 0);

    // Sideboard cards are looked up in the same pass as the deck. One call keeps
    // the progress bar honest (it counts every card the user is waiting on) and
    // gives the fallback a single shot at the whole list; the two are pulled back
    // apart afterwards by the `section` each result carries.
    //
    // Only the *sideboard* slice of the excluded cards is fetched — a maybeboard
    // or a token list is still dropped, and costs no lookup time. That also makes
    // `section: 'excluded'` unambiguous downstream: the only excluded cards that
    // reach the lookup are the ones bound for the sideboard.
    const sideboardEntries = parsed.excluded.filter(isSideboardCard);
    const lookupEntries: DeckLineItem[] = [...entries, ...sideboardEntries];

    let results: CardDataResult[];
    try {
      const lookup = await this.cardLookup.fetchImagesForList(lookupEntries, (current, total) => {
        // Feed the analytics layer too, so an import abandoned mid-fetch can
        // report how far it got. Wrapping here means every caller gets it.
        trackImportProgress(current, total);
        this.onProgress?.(current, total);
      });
      results = lookup.results;
      if (lookup.printingMismatches.length > 0) {
        trackPrintingMismatches({
          mismatches: lookup.printingMismatches,
          totalCount: lookupEntries.length,
        });
      }
      if (lookup.fallbackTriggeredCount > 0) {
        trackFallbackOutcome({
          triggeredCount: lookup.fallbackTriggeredCount,
          recoveredCount: lookup.fallbackRecoveredCount,
          failedCount: lookup.fallbackFailedCount,
          totalCount: lookupEntries.length,
          auraFailures: lookup.auraFailures,
          deadItems: lookup.failedItems,
        });
      }
    } catch (e) {
      // Unexpected throw from fetchImagesForList itself (not per-card errors,
      // which are returned as CardDataResult.error — this is a catastrophic failure)
      const message = e instanceof Error ? e.message : String(e);
      deck.errors = [`Card data fetch failed: ${message}. Please try again.`];
      trackImportFailed('fetch_catastrophic_failure', text, { message });
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
    const failedCards = results
      .filter(r => r.error)
      .map(r => ({ name: r.name, error: r.error }));

    // Deck-only, so the size numbers keep meaning what they meant before the
    // sideboard was imported: a 60-card deck with a 15-card sideboard is still a
    // 60-card import, not a 75-card one. Sideboard size is `excludedCardCount`.
    const deckResults = results.filter((r) => r.section !== 'excluded');

    const counts: ImportCounts = {
      parsedEntryCount: entries.length,
      requestedCardCount,
      importedCardCount: deck.cards.length,
      uniqueImportedCount: deckResults.filter((r) => !r.error).length,
      excludedCardCount: parsed.excludedCardCount,
      excludedSections: parsed.excludedSections,
      unrecognizedSections: parsed.unrecognizedSections,
      // Taken from the parse rather than the built deck: this is precisely the
      // set `Player` will draw into the opening hand.
      commanderCardCount: entries
        .filter((entry) => entry.commander)
        .reduce((sum, entry) => sum + entry.count, 0),
    };

    if (!deck.errors || deck.errors.length === 0) {
      trackImportSucceeded({ counts, durationMs, rawText: text });
      return deck;
    }

    // Nothing resolved at all. That is a total failure, not a partial one —
    // reporting it as "partial" (as we used to) let a backend outage hide inside
    // the partial bucket with `imported: 0`.
    if (deck.cards.length === 0) {
      trackImportFailed(
        'all_cards_failed',
        text,
        { duration_ms: durationMs, failed_entry_count: failedCards.length },
        counts,
      );
      Sentry.captureMessage("Deck import failed: no cards resolved", {
        level: "error",
        extra: {
          deckListRawString: text,
          stage: "parseResultsIntoDeck",
          ...counts,
          deckError: deck.errors,
          failedCards,
        },
      });
      return deck;
    }

    trackImportPartialFailure({
      counts,
      failedEntryCount: failedCards.length,
      durationMs,
      rawText: text,
    });

    Sentry.captureMessage("Partial deck import failure", {
      level: "warning",
      extra: {
        deckListRawString: text,
        stage: "parseResultsIntoDeck",
        ...counts,
        deckError: deck.errors,
        failedCards,
      },
    });

    return deck;
  }

  /**
   * Turn looked-up card data into the deck and its sideboard.
   *
   * Each result carries the section it was parsed under, so a card lands in the
   * sideboard because the *list* said so — not because of where it sits in the
   * results array, which the Scryfall fallback reorders. `cardNumber` keeps
   * running across both zones: it identifies a card, and a sideboard card that
   * gets played is the same card it was in the sideboard.
   */
  private parseResultsIntoDeck(deckImportResult: DeckImportResult, results: CardDataResult[]) {
    let cardNumberCounter = 1;
    const sideboard: Card[] = [];

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
        if (result.section === 'excluded') {
          sideboard.push(card);
        } else {
          deckImportResult.cards.push(card);
        }
      }
    }

    if (sideboard.length > 0) {
      deckImportResult.sideboard = sideboard;
    }
  }
}