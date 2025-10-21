import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScryfallDeckImporter } from './ScryfallDeckImporter';

// Mock the ScryfallApiService
vi.mock('../scryfall', () => ({
  ScryfallApiService: vi.fn().mockImplementation(() => ({
    parseDecklist: vi.fn().mockReturnValue([
      { name: 'Lightning Bolt', count: 4 },
      { name: 'Mountain', count: 20 },
    ]),
    fetchImagesForList: vi.fn().mockResolvedValue([
      {
        name: 'Lightning Bolt',
        count: 4,
        scryfallId: 'bolt-id',
        type_line: 'Instant',
        imageUris: { front: { normal: 'https://example.com/bolt.jpg' } },
      },
      {
        name: 'Mountain',
        count: 20,
        scryfallId: 'mountain-id',
        type_line: 'Basic Land',
        imageUris: { front: { normal: 'https://example.com/mountain.jpg' } },
      },
    ]),
  })),
}));

describe('ScryfallDeckImporter - Section Header Detection', () => {
  let importer: ScryfallDeckImporter;

  beforeEach(() => {
    importer = new ScryfallDeckImporter();
  });

  describe('Section header detection', () => {
    it('should detect SIDEBOARD section header', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain

SIDEBOARD:
1 Drill Too Deep
4 Pygmy Pyrosaur`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('Section headers detected');
      expect(result.errors![0]).toContain('SIDEBOARD:');
    });

    it('should detect COMMANDER section header', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain

COMMANDER:
1 Flubs, the Fool`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Section headers detected');
      expect(result.errors![0]).toContain('COMMANDER:');
    });

    it('should detect multiple section headers', async () => {
      const deckText = `4 Lightning Bolt

SIDEBOARD:
1 Drill Too Deep

COMMANDER:
1 Flubs, the Fool`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Section headers detected');
      expect(result.errors![0]).toContain('SIDEBOARD:');
      expect(result.errors![0]).toContain('COMMANDER:');
    });

    it('should show first 3 headers and count if more than 3', async () => {
      const deckText = `4 Lightning Bolt

SIDEBOARD:
1 Card A

COMMANDER:
1 Card B

MAYBEBOARD:
1 Card C

CONSIDERING:
1 Card D`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('and 1 more');
    });

    it('should suggest MTGO preset in error message', async () => {
      const deckText = `4 Lightning Bolt

SIDEBOARD:
1 Drill Too Deep`;

      const result = await importer.importFromText(deckText);

      expect(result.errors![0]).toContain('MTGO preset');
      expect(result.errors![0]).toContain('Moxfield');
    });

    it('should direct users to Help button', async () => {
      const deckText = `4 Lightning Bolt

SIDEBOARD:
1 Drill Too Deep`;

      const result = await importer.importFromText(deckText);

      expect(result.errors![0]).toContain('Help button');
    });

    it('should NOT detect valid card lines as section headers', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain
1 Bonfire of the Damned`;

      const result = await importer.importFromText(deckText);

      // Should succeed - no section headers detected
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });

    it('should handle case where line starts with text but is actually a card name', async () => {
      // This edge case: a card name that doesn't start with a number won't be imported
      // but we're testing that the error message is clear
      const deckText = `Lightning Bolt
4 Mountain`;

      const result = await importer.importFromText(deckText);

      // This will be detected as a section header since it doesn't start with a number
      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Section headers detected');
      expect(result.errors![0]).toContain('"Lightning Bolt"');
    });

    it('should handle mixed valid and invalid lines', async () => {
      const deckText = `4 Lightning Bolt
SIDEBOARD:
1 Drill Too Deep
20 Mountain`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('SIDEBOARD:');
    });

    it('should handle section headers with trailing colons', async () => {
      const deckText = `4 Lightning Bolt

Sideboard:
1 Card A`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Sideboard:');
    });

    it('should handle section headers without colons', async () => {
      const deckText = `4 Lightning Bolt

SIDEBOARD
1 Card A`;

      const result = await importer.importFromText(deckText);

      expect(result.cards).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('SIDEBOARD');
    });

    it('should allow importing valid deck without section headers', async () => {
      const deckText = `4 Lightning Bolt
20 Mountain
1 Zuran Orb`;

      const result = await importer.importFromText(deckText);

      // Should succeed
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();
    });
  });
});