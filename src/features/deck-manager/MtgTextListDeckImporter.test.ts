import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MtgTextListDeckImporter } from './MtgTextListDeckImporter';
import { CardLookupService } from '@/infrastructure/cards';
import type { LookupFailureReason } from '@/infrastructure/cards/CardApiClient';
import posthog from 'posthog-js';

// We mock posthog-js — not our own PosthogFunctions wrapper — so the analytics
// logic under test (count math, deck-size bucketing, raw-text gating) actually
// runs. Mocking the wrapper would assert only that we called our own functions.
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const captureMock = () => posthog.capture as unknown as Mock;

/** Properties of the last `event` captured, or undefined if it never fired. */
const capturedProps = (event: string): Record<string, any> | undefined => {
  const calls = captureMock().mock.calls.filter((call) => call[0] === event);
  return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
};

const captureCount = (event: string): number =>
  captureMock().mock.calls.filter((call) => call[0] === event).length;

type LookupOptions = {
  /** Card names whose lookup fails in both backends. */
  failNames?: string[];
  /**
   * Simulated Aura→Scryfall fallback outcome for this run. `reasons` models *why*
   * Aura missed each card (parallel to the first `triggered` entries); it defaults
   * to `not_found`, i.e. a genuine index gap.
   */
  fallback?: {
    triggered: number;
    recovered: number;
    failed: number;
    reasons?: LookupFailureReason[];
  };
  /** When set, the lookup never settles — used to model an abandoned import. */
  hang?: boolean;
};

// Mock CardLookupService so tests don't hit the network. By default every entry
// resolves; `failNames` models per-card lookup failures and `fallback` models the
// Aura→Scryfall fallback counts the real service reports.
function makeMockLookup(options: LookupOptions = {}): CardLookupService {
  const failNames = new Set(options.failNames ?? []);
  const lookup = new CardLookupService();

  vi.spyOn(lookup, 'fetchImagesForList').mockImplementation(async (entries, onProgress) => {
    if (options.hang) {
      return new Promise(() => {});
    }

    const results = entries.map((entry) => {
      if (failNames.has(entry.name)) {
        return {
          name: entry.name,
          count: entry.count,
          commander: entry.commander,
          scryfallId: '',
          type_line: undefined,
          imageUris: { front: null, back: null },
          error: `lookup failed for "${entry.name}"`,
        };
      }
      return {
        name: entry.name,
        count: entry.count,
        commander: entry.commander,
        scryfallId: `${entry.name.toLowerCase().replace(/\s+/g, '-')}-id`,
        type_line: entry.name.includes('Mountain') ? 'Basic Land' : 'Instant',
        imageUris: {
          front: { normal: `https://example.com/${entry.name.toLowerCase()}.jpg` } as any,
          back: null,
        },
      };
    });

    entries.forEach((_, index) => onProgress?.(index + 1, entries.length));

    const failedItems = entries.filter((entry) => failNames.has(entry.name));
    const triggered = options.fallback?.triggered ?? 0;
    // The cards Aura missed are modelled as the first `triggered` entries.
    const auraFailures = entries.slice(0, triggered).map((item, index) => ({
      item,
      reason: options.fallback?.reasons?.[index] ?? ('not_found' as LookupFailureReason),
    }));

    return {
      results,
      failedItems,
      failures: failedItems.map((item) => ({
        item,
        reason: 'not_found' as LookupFailureReason,
      })),
      fallbackTriggeredCount: triggered,
      fallbackRecoveredCount: options.fallback?.recovered ?? 0,
      fallbackFailedCount: options.fallback?.failed ?? 0,
      auraFailures,
    };
  });

  return lookup;
}

describe('MtgTextListDeckImporter - Section Headers', () => {
  let importer: MtgTextListDeckImporter;

  beforeEach(() => {
    captureMock().mockClear();
    importer = new MtgTextListDeckImporter(undefined, makeMockLookup());
  });

  // Distinct card names in the imported deck (each is expanded by its count).
  const importedNames = (result: { cards: { name?: string }[] }): string[] =>
    [...new Set(result.cards.map((c) => c.name).filter((n): n is string => !!n))];

  describe('Section header tolerance', () => {
    it('should import the main deck and skip a SIDEBOARD', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain

SIDEBOARD:
1 Drill Too Deep
4 Pygmy Pyrosaur`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      // 4 Lightning Bolt + 20 Mountain = 24 cards, no sideboard cards.
      expect(result.cards).toHaveLength(24);
      expect(importedNames(result).sort()).toEqual(['Lightning Bolt', 'Mountain']);
    });

    it('should import a COMMANDER section together with the main deck', async () => {
      const deckText = `COMMANDER:
1 Flubs, the Fool

DECK:
4 Lightning Bolt
20 Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      expect(result.cards).toHaveLength(25);
      expect(importedNames(result).sort()).toEqual(['Flubs, the Fool', 'Lightning Bolt', 'Mountain']);
    });

    it('should tag commander-section cards so auto-draw can find them', async () => {
      const deckText = `COMMANDER:
1 Flubs, the Fool

DECK:
4 Lightning Bolt`;

      const result = await importer.importFromText(deckText);

      const flubs = result.cards.filter((c) => c.name === 'Flubs, the Fool');
      expect(flubs).toHaveLength(1);
      expect(flubs[0].commander).toBe(true);
      // Main-deck cards are not flagged.
      expect(result.cards.filter((c) => c.name === 'Lightning Bolt').every((c) => !c.commander)).toBe(true);
    });

    it('should keep commander + main and drop sideboard and maybeboard', async () => {
      const deckText = `COMMANDER:
1 Flubs, the Fool

4 Lightning Bolt

SIDEBOARD:
1 Drill Too Deep

MAYBEBOARD:
2 Counterspell`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      expect(importedNames(result).sort()).toEqual(['Flubs, the Fool', 'Lightning Bolt']);
    });

    it('should import unrecognized (Archidekt-style) category headers', async () => {
      const deckText = `Creatures
4 Monastery Swiftspear

Lands
20 Mountain

Maybeboard
1 Counterspell`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      expect(importedNames(result).sort()).toEqual(['Monastery Swiftspear', 'Mountain']);
    });

    it('should import a quantity-less line as a single card', async () => {
      const deckText = `Lightning Bolt
4 Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      // "Lightning Bolt" (no quantity) imports as one card; "4 Mountain" as four.
      expect(result.cards).toHaveLength(5);
      expect(importedNames(result).sort()).toEqual(['Lightning Bolt', 'Mountain']);
    });

    it('should report no valid entries when every card is in an excluded section', async () => {
      const deckText = `SIDEBOARD:
1 Drill Too Deep
4 Pygmy Pyrosaur`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('No valid card entries');
    });

    it('should allow importing a valid deck without section headers', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain
1 Zuran Orb`;

      const result = await importer.importFromText(deckText);

      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('x notation support', () => {
    it('should import deck with lowercase x notation', async () => {
      const deckText = `4x Lightning Bolt
20x Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });

    it('should import deck with uppercase X notation', async () => {
      const deckText = `4X Lightning Bolt
20X Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });

    it('should import deck with mixed x notation and regular notation', async () => {
      const deckText = `4x Lightning Bolt
20 Mountain
1X Sol Ring`;

      const result = await importer.importFromText(deckText);

      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });
  });
});

describe('MtgTextListDeckImporter - import telemetry', () => {
  beforeEach(() => {
    captureMock().mockClear();
  });

  const importWith = (text: string, options?: LookupOptions) =>
    new MtgTextListDeckImporter(undefined, makeMockLookup(options)).importFromText(text);

  // A legal Commander deck: 1 commander + 99 main = 100 cards.
  const COMMANDER_100 = `COMMANDER:
1 Flubs, the Fool

DECK:
99 Mountain`;

  const STANDARD_60 = `20 Lightning Bolt
40 Mountain`;

  describe('deck size and card counts', () => {
    it('reports a legal 100-card commander deck as a standard size', async () => {
      await importWith(COMMANDER_100);

      const props = capturedProps('deck_import_succeeded');
      expect(props).toMatchObject({
        requested_card_count: 100,
        imported_card_count: 100,
        cards_missing: 0,
        requested_size_bucket: '100',
        is_standard_deck_size: true,
        is_standard_imported_size: true,
      });
    });

    it('keeps the raw text of a clean import too, not just the broken ones', async () => {
      // A corpus of only anomalies tells us what breaks but never what "working"
      // looks like — and a clean, legal deck is the regression baseline.
      await importWith(COMMANDER_100);

      expect(capturedProps('deck_import_succeeded')!.raw_text).toBe(COMMANDER_100);
    });

    it('reports a legal 60-card deck as a standard size', async () => {
      await importWith(STANDARD_60);

      expect(capturedProps('deck_import_succeeded')).toMatchObject({
        requested_card_count: 60,
        imported_card_count: 60,
        requested_size_bucket: '60',
        is_standard_deck_size: true,
      });
    });

    it('reports how many cards the command zone claimed', async () => {
      // The size of the opening hand this import is about to produce, since
      // Player draws every commander-tagged card. Reported on every import —
      // a command zone that swallowed the deck still yields a textbook 100-card
      // deck size, so no other property in the event can see it.
      await importWith(`COMMANDER:
1 Krenko, Mob Boss

1 Lightning Bolt
1 Mountain`);

      expect(capturedProps('deck_import_succeeded')).toMatchObject({
        commander_card_count: 1,
        command_zone_overflowed: false,
      });
    });

    it('reports a command zone that has stopped meaning anything', async () => {
      // Three commanders is not a deck-building choice, it is a parser fault —
      // and the shape that produces it (a commander header, no terminator) used
      // to tag the entire deck. This is the alerting signal.
      await importWith(`COMMANDER:
1 Krenko, Mob Boss
1 Sol Ring
1 Lightning Bolt`);

      const props = capturedProps('deck_import_succeeded');
      // The parser now bounds the zone, so the overflow flag must stay false —
      // if this ever flips, the bound has regressed and players are being dealt
      // their decks again.
      expect(props).toMatchObject({
        commander_card_count: 1,
        command_zone_overflowed: false,
      });
    });

    it('keeps the raw text when a fully-successful import lands on an illegal deck size', async () => {
      // Every card resolved, so a 24-card deck can only mean the *list* was short
      // (or we dropped lines parsing it) — exactly the case the raw text diagnoses.
      const deckText = `4 Lightning Bolt
20 Mountain`;

      await importWith(deckText);

      const props = capturedProps('deck_import_succeeded');
      expect(props).toMatchObject({
        requested_card_count: 24,
        imported_card_count: 24,
        cards_missing: 0,
        requested_size_bucket: 'other',
        is_standard_deck_size: false,
      });
      expect(props!.raw_text).toBe(deckText);
    });

    it('imports a legal 100 from a list whose sideboard contains a blank line', async () => {
      // The regression that made ~10% of "successful" imports come out over-sized:
      // a blank line inside the sideboard used to reopen the main deck, so the
      // three cards below it were imported and a 100-card deck arrived as 103.
      await importWith(`COMMANDER:
1 Flubs, the Fool

DECK:
99 Mountain

SIDEBOARD:
1 Ancient Grudge

1 Counterspell
2 Pyroblast`);

      expect(capturedProps('deck_import_succeeded')).toMatchObject({
        requested_card_count: 100,
        imported_card_count: 100,
        excluded_card_count: 4, // 1 Grudge + 1 Counterspell + 2 Pyroblast
        excluded_sections: ['sideboard'],
        is_standard_deck_size: true,
        is_standard_imported_size: true,
      });
    });

    it('names the unrecognized header when one waves cards into the main deck', async () => {
      // A custom category we don't know is imported as main — the likeliest cause
      // of an over-sized deck, and the only signal that can name the culprit.
      await importWith(`Deck
60 Mountain

Pet Cards (2)
1 Sol Ring
1 Arcane Signet`);

      expect(capturedProps('deck_import_succeeded')).toMatchObject({
        requested_card_count: 62,
        is_standard_deck_size: false,
        unrecognized_sections: ['pet cards'],
      });
    });

    it('counts the sideboard cards it deliberately dropped', async () => {
      await importWith(`${STANDARD_60}

SIDEBOARD:
15 Counterspell`);

      // The main deck is a legal 60 and the 15 sideboard cards are reported
      // separately, so the 15 "missing" lines are explained rather than suspicious.
      expect(capturedProps('deck_import_succeeded')).toMatchObject({
        requested_card_count: 60,
        imported_card_count: 60,
        excluded_card_count: 15,
        is_standard_deck_size: true,
      });
    });

    it('separates cards our lookup lost from a list that was short to begin with', async () => {
      // The list asks for a legal 100; the lookup loses the 4 Mountains. The input
      // was fine — this one is on us, and `cards_missing` is what says so.
      await importWith(
        `COMMANDER:
1 Flubs, the Fool

DECK:
95 Island
4 Mountain`,
        { failNames: ['Mountain'] },
      );

      expect(capturedProps('deck_import_partial_failure')).toMatchObject({
        requested_card_count: 100,
        imported_card_count: 96,
        cards_missing: 4,
        failed_entry_count: 1,
        is_standard_deck_size: true, // the list was a legal deck…
        is_standard_imported_size: false, // …but what we handed the player is not
      });
    });
  });

  describe('failure classification', () => {
    it('reports a total lookup wipeout as failed, not as a partial failure', async () => {
      await importWith(STANDARD_60, { failNames: ['Lightning Bolt', 'Mountain'] });

      expect(captureCount('deck_import_partial_failure')).toBe(0);

      const props = capturedProps('deck_import_failed');
      expect(props).toMatchObject({
        reason: 'all_cards_failed',
        requested_card_count: 60,
        imported_card_count: 0,
        cards_missing: 60,
      });
      expect(props!.raw_text).toBe(STANDARD_60);
    });
  });

  describe('fallback outcome', () => {
    it('reports how many cards the Scryfall fallback recovered vs. lost for good', async () => {
      await importWith(
        `1 Sol Ring
1 Counterspell
1 Island
1 Mountain`,
        { fallback: { triggered: 2, recovered: 1, failed: 1 } },
      );

      expect(capturedProps('deck_import_fallback_triggered')).toMatchObject({
        aura_failed_count: 2,
        total_count: 4,
        fallback_recovered_count: 1,
        fallback_failed_count: 1,
        fallback_recovery_rate: 0.5,
        aura_miss_rate: 0.5,
      });
    });

    it('stays silent when the primary backend resolves every card', async () => {
      await importWith(STANDARD_60);

      expect(captureCount('deck_import_fallback_triggered')).toBe(0);
    });

    // The distinction these two tests draw is the whole reason the reason-breakdown
    // exists: both imports below miss the same number of cards, so the legacy
    // `aura_miss_rate` is identical (0.5) for both. Only the split tells you that
    // one is a card-index gap to reindex and the other is a backend outage to page
    // someone about.
    it('attributes a genuine index gap to not_found, and names the cards', async () => {
      await importWith(
        `1 Brazen Borrower // Petty Theft
1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki
1 Island
1 Mountain`,
        {
          fallback: {
            triggered: 2,
            recovered: 2,
            failed: 0,
            reasons: ['not_found', 'not_found'],
          },
        },
      );

      expect(capturedProps('deck_import_fallback_triggered')).toMatchObject({
        aura_failed_not_found: 2,
        aura_failed_network_or_blocked: 0,
        aura_dominant_failure_reason: 'not_found',
        aura_index_miss_rate: 0.5,
        aura_infra_failure_rate: 0,
        // Front faces: the parser reduces "Front // Back" before lookup, because
        // the card API indexes the front face.
        aura_not_found_cards: ['Brazen Borrower', 'Fable of the Mirror-Breaker'],
      });
    });

    it('attributes a blocked backend to infra, and does not blame the card index', async () => {
      await importWith(
        `1 Sol Ring
1 Counterspell
1 Island
1 Mountain`,
        {
          fallback: {
            triggered: 2,
            recovered: 2,
            failed: 0,
            reasons: ['network_or_blocked', 'network_or_blocked'],
          },
        },
      );

      const props = capturedProps('deck_import_fallback_triggered');
      expect(props).toMatchObject({
        aura_failed_network_or_blocked: 2,
        aura_failed_not_found: 0,
        aura_dominant_failure_reason: 'network_or_blocked',
        aura_index_miss_rate: 0,
        aura_infra_failure_rate: 0.5,
      });
      // Cards lost to an unreachable backend are whatever happened to be in the
      // deck — reporting them as index misses is what sent us hunting for a
      // culprit card that never existed.
      expect(props!.aura_not_found_cards).toEqual([]);
      // ...while the legacy metric cannot tell the two cases apart at all.
      expect(props!.aura_miss_rate).toBe(0.5);
    });

    it('reports cards no backend could resolve — the ones the player actually loses', async () => {
      await importWith(
        `1 Sol Ring
1 Totally Fake Card`,
        {
          failNames: ['Totally Fake Card'],
          fallback: { triggered: 1, recovered: 0, failed: 1, reasons: ['not_found'] },
        },
      );

      expect(capturedProps('deck_import_fallback_triggered')).toMatchObject({
        dead_cards: ['Totally Fake Card'],
        fallback_failed_count: 1,
        fallback_recovery_rate: 0,
      });
    });
  });

  describe('abandonment', () => {
    it('emits an abandoned event when the page unloads mid-import', async () => {
      // A 100-card import takes tens of seconds in the real world, so the user
      // closing the tab mid-fetch is the ordinary case, not an exotic one.
      void importWith(COMMANDER_100, { hang: true });
      await Promise.resolve();

      window.dispatchEvent(new Event('pagehide'));

      expect(capturedProps('deck_import_abandoned')).toMatchObject({
        line_count: 4,
        cards_fetched: 0,
      });
      expect(captureCount('deck_import_succeeded')).toBe(0);

      // A normal XHR is cancelled as the page tears down; only a beacon survives.
      const call = captureMock().mock.calls.find((c) => c[0] === 'deck_import_abandoned');
      expect(call?.[2]).toEqual({ transport: 'sendBeacon' });
    });

    it('does not report an abandonment after the import has settled', async () => {
      await importWith(STANDARD_60);
      captureMock().mockClear();

      window.dispatchEvent(new Event('pagehide'));

      expect(captureCount('deck_import_abandoned')).toBe(0);
    });
  });
});
