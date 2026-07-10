import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MtgTextListDeckImporter } from './MtgTextListDeckImporter';
import { CardLookupService } from '@/infrastructure/cards';

// Mock CardLookupService so tests don't hit the network.
// We construct a minimal CardLookupService whose fetchImagesForList returns
// canned successful results for every entry — no fallback needed.
function makeMockLookup(): CardLookupService {
  const lookup = new CardLookupService();
  vi.spyOn(lookup, 'fetchImagesForList').mockImplementation(async (entries) => ({
    results: entries.map((entry) => ({
      name: entry.name,
      count: entry.count,
      commander: entry.commander,
      scryfallId: `${entry.name.toLowerCase().replace(/\s+/g, '-')}-id`,
      type_line: entry.name.includes('Mountain') ? 'Basic Land' : 'Instant',
      imageUris: {
        front: { normal: `https://example.com/${entry.name.toLowerCase()}.jpg` } as any,
        back: null,
      },
    })),
    failedItems: [],
    fallbackTriggeredCount: 0,
  }));
  return lookup;
}

describe('MtgTextListDeckImporter - Section Headers', () => {
  let importer: MtgTextListDeckImporter;

  beforeEach(() => {
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

    it('should treat a leading non-numbered line as a header and still import numbered cards', async () => {
      const deckText = `Lightning Bolt
4 Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.errors).toBeUndefined();
      expect(importedNames(result)).toEqual(['Mountain']);
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
