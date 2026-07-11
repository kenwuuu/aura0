import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MtgTextListDeckImporter } from './MtgTextListDeckImporter';
import { CardLookupService } from '@/infrastructure/cards';
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
  /** Simulated Aura→Scryfall fallback outcome for this run. */
  fallback?: { triggered: number; recovered: number; failed: number };
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

    return {
      results,
      failedItems: entries.filter((entry) => failNames.has(entry.name)),
      fallbackTriggeredCount: options.fallback?.triggered ?? 0,
      fallbackRecoveredCount: options.fallback?.recovered ?? 0,
      fallbackFailedCount: options.fallback?.failed ?? 0,
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
      // A clean, legal import doesn't need its raw text kept.
      expect(props).not.toHaveProperty('raw_text');
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
