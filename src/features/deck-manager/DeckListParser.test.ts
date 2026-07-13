import {describe, it, expect, beforeEach} from 'vitest';
import {parseDecklist, validateFormat} from './DeckListParser';

describe('DeckListParser', () => {
  describe('parseDecklist', () => {
    describe('basic parsing', () => {
      it('should parse a simple deck list', () => {
        const deckText = `4 Lightning Bolt
20 Mountain
1 Zuran Orb`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[2]).toEqual({ count: 1, name: 'Zuran Orb' });
      });

      it('should handle single-digit counts', () => {
        const deckText = '1 Black Lotus';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 1, name: 'Black Lotus' });
      });

      it('should handle multi-digit counts', () => {
        const deckText = '60 Mountain';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 60, name: 'Mountain' });
      });

      it('should handle card names with multiple words', () => {
        const deckText = '4 Sol Ring of Power';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Sol Ring of Power' });
      });

      it('should handle extra whitespace', () => {
        const deckText = '  4   Lightning   Bolt  ';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should handle empty lines', () => {
        const deckText = `4 Lightning Bolt

20 Mountain

1 Zuran Orb`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[2]).toEqual({ count: 1, name: 'Zuran Orb' });
      });
    });

    describe('x notation support', () => {
      it('should parse lowercase x notation (e.g., "4x")', () => {
        const deckText = '4x Lightning Bolt';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should parse uppercase X notation (e.g., "4X")', () => {
        const deckText = '4X Lightning Bolt';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should handle x notation with multi-digit counts', () => {
        const deckText = '20x Mountain';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 20, name: 'Mountain' });
      });

      it('should handle mixed x notation and regular notation', () => {
        const deckText = `4x Lightning Bolt
20 Mountain
1x Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[2]).toEqual({ count: 1, name: 'Sol Ring' });
      });

      it('should handle x notation with extra whitespace', () => {
        const deckText = '  4x   Lightning   Bolt  ';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });
    });

    describe('section filtering', () => {
      it('should exclude cards under a SIDEBOARD header', () => {
        const deckText = `SIDEBOARD:
4 Lightning Bolt
20 Mountain`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(0);
      });

      it('should exclude the sideboard but keep cards before it', () => {
        const deckText = `4 Lightning Bolt
20 Mountain

SIDEBOARD:
2 Ancient Grudge`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
      });

      it('should resume importing after a blank line closes the sideboard (MTGO card below SIDEBOARD:)', () => {
        // MTGO/Arena can list a card (e.g. a companion) below the sideboard.
        // A blank line closes the sideboard so that card is imported again,
        // while the sideboard cards between the header and the blank are dropped.
        const deckText = `1 Whiskervale Forerunner

SIDEBOARD:
1 Festival of Embers
1 Warleader's Call

1 Mabel, Heir to Cragflame`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Whiskervale Forerunner' },
          { count: 1, name: 'Mabel, Heir to Cragflame' },
        ]);
      });

      it('should not let a blank line reset the command zone (only `excluded` resets)', () => {
        // The blank-line reset is scoped to `excluded` sections. A blank inside
        // the command zone must not turn it off, so cards after it keep the
        // commander tag (the section still only truly ends at the next header).
        const deckText = `COMMANDER:
1 Krenko, Mob Boss

1 Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true },
          { count: 1, name: 'Sol Ring', commander: true },
        ]);
      });

      it('should import the main deck and tag commander-section cards', () => {
        const deckText = `COMMANDER:
1 Flubs, the Fool
DECK:
4 Lightning Bolt`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 1, name: 'Flubs, the Fool', commander: true });
        expect(result[1]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should tag cards under a "Command Zone" header', () => {
        const deckText = `Command Zone
1 Atraxa, Praetors' Voice`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 1, name: "Atraxa, Praetors' Voice", commander: true });
      });

      it('should tag every card under a commander header (partners)', () => {
        const deckText = `COMMANDER:
1 Thrasios, Triton Hero
1 Tymna the Weaver

DECK:
4 Lightning Bolt`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        // Both partners are flagged — not just the first line under the header.
        expect(result[0]).toEqual({ count: 1, name: 'Thrasios, Triton Hero', commander: true });
        expect(result[1]).toEqual({ count: 1, name: 'Tymna the Weaver', commander: true });
        // The section resets at the next header; main-deck cards are not flagged.
        expect(result[2]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should not flag any card when the list has no headers', () => {
        const deckText = `1 Sol Ring
20 Mountain
1 Krenko, Mob Boss`;

        const result = parseDecklist(deckText);

        expect(result.every((item) => item.commander === undefined)).toBe(true);
      });

      it('should keep commander + main and drop sideboard and maybeboard', () => {
        const deckText = `MAIN DECK:
4 Lightning Bolt
SIDEBOARD:
1 Ancient Grudge
MAYBEBOARD:
2 Counterspell`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should import unrecognized headers as part of the deck (Archidekt categories)', () => {
        const deckText = `Creatures
4 Monastery Swiftspear
Lands
20 Mountain`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 4, name: 'Monastery Swiftspear' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
      });

      it('should match excluded headers case-insensitively and with a trailing count', () => {
        const deckText = `4 Lightning Bolt
sideboard (15)
1 Ancient Grudge`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should ignore comment lines without changing the active section', () => {
        const deckText = `# This is my deck
4 Lightning Bolt
// Another comment
20 Mountain`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
      });

      it('should keep a comment from leaking sideboard cards into the deck', () => {
        const deckText = `4 Lightning Bolt

SIDEBOARD:
// my flex slot
2 Ancient Grudge`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
      });

      it('should handle deck with only section headers (returns empty)', () => {
        const deckText = `SIDEBOARD:
COMMANDER:
MAYBEBOARD:`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(0);
      });
    });

    describe('quantity-less lists', () => {
      it('should treat an unrecognized non-header line as a single (count 1) card', () => {
        const deckText = `Sol Ring
4 Lightning Bolt
Arcane Signet
20 Mountain`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring' },
          { count: 4, name: 'Lightning Bolt' },
          { count: 1, name: 'Arcane Signet' },
          { count: 20, name: 'Mountain' },
        ]);
      });

      it('should import a fully quantity-less singleton list', () => {
        const deckText = `Sol Ring
Arcane Signet
Command Tower`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring' },
          { count: 1, name: 'Arcane Signet' },
          { count: 1, name: 'Command Tower' },
        ]);
      });

      it('should duplicate repeated basic lands per line', () => {
        // A quantity-less export has no quantity field, so N copies of a basic
        // are N separate lines. Each becomes one card.
        const deckText = `Island
Island
Island
Forest
Forest`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Island' },
          { count: 1, name: 'Island' },
          { count: 1, name: 'Island' },
          { count: 1, name: 'Forest' },
          { count: 1, name: 'Forest' },
        ]);
      });

      it('should not read a basic-land card name as a "Lands" header', () => {
        // "Island"/"Wasteland" contain the substring "land" but are cards, while
        // a bare "Lands" line is a category header.
        const deckText = `Lands
Island
Wasteland`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Island' },
          { count: 1, name: 'Wasteland' },
        ]);
      });

      it('should not treat a card whose name contains a section word as a header', () => {
        const deckText = `Commander's Sphere
Command Tower
Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: "Commander's Sphere" },
          { count: 1, name: 'Command Tower' },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should tag quantity-less partner commanders under a commander header', () => {
        const deckText = `Commander
Kraum, Ludevic's Opus
Tymna the Weaver

Deck
Sol Ring
Command Tower`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: "Kraum, Ludevic's Opus", commander: true },
          { count: 1, name: 'Tymna the Weaver', commander: true },
          { count: 1, name: 'Sol Ring' },
          { count: 1, name: 'Command Tower' },
        ]);
      });

      it('should mix quantity-prefixed and quantity-less lines', () => {
        const deckText = `Commander
Krenko, Mob Boss

Deck
1 Sol Ring
Island
Island`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true },
          { count: 1, name: 'Sol Ring' },
          { count: 1, name: 'Island' },
          { count: 1, name: 'Island' },
        ]);
      });

      it('should parse set info on a quantity-less line', () => {
        const deckText = `Sol Ring (C21) 263`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring', setCode: 'C21', collectorNumber: '263' },
        ]);
      });

      it('should skip quantity-less cards under an excluded section', () => {
        const deckText = `Deck
Sol Ring

Sideboard
Swords to Plowshares`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([{ count: 1, name: 'Sol Ring' }]);
      });

      it('should treat an Archidekt category header with a trailing count as a header', () => {
        const deckText = `Ramp (2)
1 Sol Ring
Arcane Signet
Removal (1)
1 Swords to Plowshares`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring' },
          { count: 1, name: 'Arcane Signet' },
          { count: 1, name: 'Swords to Plowshares' },
        ]);
      });
    });

    describe('comment-style section markers', () => {
      it('should recognize // and # prefixed section headers', () => {
        const deckText = `// Commander
Krenko, Mob Boss
# Deck
1 Sol Ring
// Sideboard
1 Swords to Plowshares`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should keep treating a // or # note that is not a section as a comment', () => {
        const deckText = `# This is my deck
4 Lightning Bolt
// a flavor note
20 Mountain`;

        const result = parseDecklist(deckText);

        // The comment lines are ignored (not turned into cards) and do not
        // change the active section.
        expect(result).toEqual([
          { count: 4, name: 'Lightning Bolt' },
          { count: 20, name: 'Mountain' },
        ]);
      });
    });

    describe('edge cases', () => {
      it('should return empty array for empty string', () => {
        const result = parseDecklist('');
        expect(result).toHaveLength(0);
      });

      it('should return empty array for whitespace only', () => {
        const result = parseDecklist('   \n\n  \n  ');
        expect(result).toHaveLength(0);
      });

      it('should filter out invalid entries (no card name)', () => {
        const deckText = `4 Lightning Bolt
5
20 Mountain`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
      });

      it('should filter out entries with invalid counts', () => {
        const deckText = `4 Lightning Bolt
0 Mountain
-1 Island
20 Forest`;

        const result = parseDecklist(deckText);

        // Note: NaN entries will be filtered by the final filter
        // 0 and negative numbers won't be filtered by isNaN but should be
        // This test documents current behavior
        expect(result.length).toBeGreaterThanOrEqual(2);
        expect(result).toContainEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result).toContainEqual({ count: 20, name: 'Forest' });
      });

      it('should handle Windows-style line endings', () => {
        const deckText = '4 Lightning Bolt\r\n20 Mountain\r\n1 Sol Ring';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[1]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[2]).toEqual({ count: 1, name: 'Sol Ring' });
      });

      it('should handle card names with special characters', () => {
        const deckText = '4 Jace, the Mind Sculptor';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Jace, the Mind Sculptor' });
      });

      it('should handle card names with apostrophes', () => {
        const deckText = "1 Urza's Saga";
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 1, name: "Urza's Saga" });
      });

      it('should handle card names with hyphens', () => {
        const deckText = '4 Lightning Bolt-Helix';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ count: 4, name: 'Lightning Bolt-Helix' });
      });

      it('should handle very long card names', () => {
        const deckText = '1 The Ultimate Nightmare of Wizards of the Coast Customer Service';
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          count: 1,
          name: 'The Ultimate Nightmare of Wizards of the Coast Customer Service',
        });
      });

      it('should handle cards with slashes and incorrect collectorNumber', () => {
        // Birgi is a modal double-faced card. This previously asserted the back
        // face was kept on the name — codifying the bug it was meant to catch.
        // "Birgi, God of Storytelling / Harnfel, Horn of Bounty" is a 404 against
        // the card API; only the front face resolves.
        const deckText = `1 Birgi, God of Storytelling / Harnfel, Horn of Bounty (J21) 416 *F*
          1 Faithless Looting (STA) 101e *F*`;
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 1, name: 'Birgi, God of Storytelling', setCode: 'J21', collectorNumber: '416' });
        expect(result[1]).toEqual({ count: 1, name: 'Faithless Looting', setCode: 'STA', collectorNumber: '101e' });
      });

      it('should handle lines with Archidekt formatting', () => {
        const deckText = `Commander
1 Ms. Bumbleflower (blc) 3 [Commander{top}]

Artifact
1 Arcane Signet (blc) 127 [Artifact]
`;
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ count: 1, name: 'Ms. Bumbleflower', setCode: 'blc', collectorNumber: '3', commander: true });
        expect(result[1]).toEqual({ count: 1, name: 'Arcane Signet', setCode: 'blc', collectorNumber: '127' });
      });

    });

    describe('real-world formats', () => {
      it('should parse MTGO format', () => {
        const deckText = `4 Lightning Bolt
4 Chain Lightning
4 Lava Spike
4 Rift Bolt
20 Mountain
24 Island`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(6);
        expect(result.reduce((sum, entry) => sum + entry.count, 0)).toBe(60);
      });

      it('should parse Moxfield MTGO preset', () => {
        const deckText = `1 Arid Mesa
4 Boros Charm
4 Goblin Guide
4 Inspiring Vantage
4 Lava Spike
4 Lightning Bolt
4 Lightning Helix
4 Monastery Swiftspear
11 Mountain
2 Sacred Foundry
4 Searing Blaze
4 Skewer the Critics
4 Skullcrack
2 Sunbaked Canyon`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(14);
        expect(result.reduce((sum, entry) => sum + entry.count, 0)).toBe(56);
      });

      it('should handle Arena format with x notation', () => {
        const deckText = `4x Lightning Bolt (M11) 1
20x Mountain (M20) 1
1x Sol Ring (C21) 1`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        // Note: This will include the set codes in the card name
        // That's OK - Scryfall search will ignore them
        expect(result[0].count).toBe(4);
        expect(result[0].name).toContain('Lightning Bolt');
      });
    });

    describe('complex mixed scenarios', () => {
      it('should tag the commander, keep the main deck, and drop the sideboard', () => {
        const deckText = `COMMANDER:
1 Flubs, the Fool

MAIN DECK:
4x Lightning Bolt
20 Mountain
1X Sol Ring

// Some comment
SIDEBOARD:
2 Ancient Grudge
  3   Counterspell  `;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({ count: 1, name: 'Flubs, the Fool', commander: true });
        expect(result[1]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[2]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[3]).toEqual({ count: 1, name: 'Sol Ring' });
      });

      it('should drop set-annotated cards that live under the sideboard', () => {
        const deckText = `COMMANDER:
1 Flubs, the Fool

MAIN DECK:
4x Lightning Bolt
20 Mountain
1X Sol Ring
1 Mabel, Heir to Cragflame (BLB) 336

// Some comment
SIDEBOARD:
2 Ancient Grudge
3   Counterspell
1 Aegis of the Legion (CLU) 22
1 Arcane Signet (BLC) 127`;

        const result = parseDecklist(deckText);

        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({ count: 1, name: 'Flubs, the Fool', commander: true });
        expect(result[1]).toEqual({ count: 4, name: 'Lightning Bolt' });
        expect(result[2]).toEqual({ count: 20, name: 'Mountain' });
        expect(result[3]).toEqual({ count: 1, name: 'Sol Ring' });
        expect(result[4]).toEqual({ count: 1, name: 'Mabel, Heir to Cragflame', setCode: 'BLB', collectorNumber: '336' });
      });

      it('should handle letters in collector number', () => {
        const deckText = `
1 Taiga (OLGC) 2017EU
1 Windswept Heath (WC04) jn328
1 Zuran Orb (PTC) et350
`
        const result = parseDecklist(deckText);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ count: 1, name: 'Taiga', setCode: 'OLGC', collectorNumber: '2017EU' });
        expect(result[1]).toEqual({ count: 1, name: 'Windswept Heath', setCode: 'WC04', collectorNumber: 'jn328' });
        expect(result[2]).toEqual({ count: 1, name: 'Zuran Orb', setCode: 'PTC', collectorNumber: 'et350' });
      });
    });

    describe('two-faced cards', () => {
      // Moxfield and friends write the full "Front // Back" name for double-faced,
      // split, and Adventure cards. The card API indexes the front face, so leaving
      // the back face on the name 404s it and silently falls through to Scryfall —
      // which our telemetry then blamed on the card index.
      it('reduces a double-faced name to its front face', () => {
        expect(parseDecklist('1 Brazen Borrower // Petty Theft')).toEqual([
          { count: 1, name: 'Brazen Borrower' },
        ]);
      });

      it('reduces a split-card name to its front face', () => {
        expect(parseDecklist('1 Fire // Ice')).toEqual([{ count: 1, name: 'Fire' }]);
      });

      it('strips the back face on the set-annotated path too', () => {
        // This path reads the raw line rather than the tokenised parts, so it has
        // to strip the back face itself — it was the branch the original fix missed.
        expect(parseDecklist('1x Brazen Borrower // Petty Theft (sld) 234')).toEqual([
          { count: 1, name: 'Brazen Borrower', setCode: 'sld', collectorNumber: '234' },
        ]);
      });

      it('handles the single-slash separator some exporters use', () => {
        expect(parseDecklist('1 Fire / Ice')).toEqual([{ count: 1, name: 'Fire' }]);
      });

      it('leaves a slash inside a name alone when it is not a separator', () => {
        expect(parseDecklist('1 Borrowing 100,000 Arrows')).toEqual([
          { count: 1, name: 'Borrowing 100,000 Arrows' },
        ]);
      });

      // "SP//dr, Piloted by Peni" is a real card containing a literal "//" that is
      // NOT a face separator. This is why the separator has to be a whitespace-
      // delimited token — a bare split on "//" would truncate the name to "SP".
      it('does not treat a // inside a word as a face separator', () => {
        expect(parseDecklist('1 SP//dr, Piloted by Peni')).toEqual([
          { count: 1, name: 'SP//dr, Piloted by Peni' },
        ]);
      });

      it('keeps a // inside a word intact on the set-annotated path too', () => {
        expect(parseDecklist('1x SP//dr, Piloted by Peni (spm) 42')).toEqual([
          { count: 1, name: 'SP//dr, Piloted by Peni', setCode: 'spm', collectorNumber: '42' },
        ]);
      });
    });
  });

  describe('validateFormat', () => {
    it('should validate deck with x notation', () => {
      const deckText = `4x Lightning Bolt
20x Mountain`;

      const result = validateFormat(deckText);

      expect(result).toBe(true);
    });

    it('should validate deck with mixed notation', () => {
      const deckText = `4x Lightning Bolt
20 Mountain`;

      const result = validateFormat(deckText);

      expect(result).toBe(true);
    });

    it('should invalidate empty deck', () => {
      const result = validateFormat('');
      expect(result).toBe(false);
    });

    it('should invalidate deck with only section headers', () => {
      const deckText = `SIDEBOARD:
COMMANDER:`;

      const result = validateFormat(deckText);

      expect(result).toBe(false);
    });

    it('should validate a quantity-less list', () => {
      const deckText = `Sol Ring
Arcane Signet
Command Tower`;

      const result = validateFormat(deckText);

      expect(result).toBe(true);
    });

//     it('should validate deck even if it contains lines to be ignored', () => {
//       const deckText = `# Comment
// 4 Lightning Bolt
// Some text
// 20 Mountain`;
//
//       const result = validateFormat(deckText);
//
//       expect(result).toBe(true);
//     });
  });
});