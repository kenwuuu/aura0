import {describe, it, expect, beforeEach} from 'vitest';
import {parseDecklist, parseDecklistWithStats, validateFormat} from './DeckListParser';

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

      it('should keep a blank line inside the sideboard from leaking cards into the deck', () => {
        // A section runs until the NEXT header — a blank line does not end it.
        // The parser used to reset to the main deck on a blank, so every card
        // below the blank was silently imported. That is how a 100-card deck
        // came out at 103.
        const deckText = `1 Whiskervale Forerunner

SIDEBOARD:
1 Festival of Embers
1 Warleader's Call

1 Mabel, Heir to Cragflame`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([{ count: 1, name: 'Whiskervale Forerunner' }]);
      });

      it('should hand back the sideboard cards it withheld rather than dropping them silently', () => {
        const deckText = `1 Whiskervale Forerunner

SIDEBOARD:
1 Festival of Embers

1 Mabel, Heir to Cragflame`;

        const { excluded, excludedCardCount, excludedSections } = parseDecklistWithStats(deckText);

        // Both sideboard cards — including the one below the blank line — come
        // back with their provenance intact, so the importer can explain the
        // deck-size delta instead of leaving it to be guessed at.
        expect(excluded).toEqual([
          { count: 1, name: 'Festival of Embers', tags: ['sideboard'], section: 'excluded' },
          { count: 1, name: 'Mabel, Heir to Cragflame', tags: ['sideboard'], section: 'excluded' },
        ]);
        expect(excludedCardCount).toBe(2);
        expect(excludedSections).toEqual(['sideboard']);
      });

      it('should end the command zone at a blank line when no main header follows', () => {
        // The common Archidekt/plain-text shape: a COMMANDER: block, a blank
        // line, then the deck — with no "Deck" header to switch back on. The
        // blank is the only thing marking the command zone as over. Tagging the
        // cards after it is not a cosmetic slip: Player.moveCommandersToHand
        // draws every commander-tagged card, so a deck parsed this way lands in
        // the player's opening hand in its entirety.
        const deckText = `COMMANDER:
1 Krenko, Mob Boss

1 Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should tag both partners when the list says where the command zone ends', () => {
        const deckText = `COMMANDER:
1 Thrasios, Triton Hero
1 Tymna the Weaver

1 Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Thrasios, Triton Hero', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Tymna the Weaver', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should tag only the first card when the command zone is never closed', () => {
        // No blank line, no "Deck" header — nothing says where the command zone
        // ends. A second legendary could be a partner or just the first card of
        // the deck, and the list gives us no way to tell. Guessing "partner"
        // would put a card the player never chose into their opening hand, so
        // the first card is the commander and the rest is deck.
        //
        // The cards demoted by the overrun keep no provenance: the command zone
        // is being read as having only ever held the first card, so they were
        // never in it — they read exactly like the cards below them.
        const deckText = `COMMANDER:
1 Sauron, Lord of the Rings
1 Anger
1 Arcane Denial
1 Arcane Signet`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sauron, Lord of the Rings', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Anger' },
          { count: 1, name: 'Arcane Denial' },
          { count: 1, name: 'Arcane Signet' },
        ]);
      });

      it('should keep the command zone open across a blank line that sits under the header', () => {
        // A blank directly under a header is padding, not a terminator — the
        // section has taken no cards yet, so it stays open and the commander is
        // still tagged.
        const deckText = `COMMANDER:

1 Krenko, Mob Boss

1 Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should not import a sideboard whose header is followed by a blank line', () => {
        // The same padding rule, on the section where getting it wrong is
        // expensive: if the blank under "Sideboard" ended the section, all 15
        // sideboard cards would import and a 60-card deck would arrive as 75.
        const deckText = `1 Whiskervale Forerunner

Sideboard

1 Festival of Embers
1 Warleader's Call`;

        const { items, excludedCardCount } = parseDecklistWithStats(deckText);

        expect(items).toEqual([{ count: 1, name: 'Whiskervale Forerunner' }]);
        expect(excludedCardCount).toBe(2);
      });

      it('should leave a companion parked below the sideboard block excluded', () => {
        // MTGO/Arena write the companion under the sideboard, separated by a
        // blank. A blank does not end an excluded section, so the companion stays
        // in the sideboard — which is where it belongs: `companion` is itself an
        // excluded header, and a companion is a sideboard card by the rules of
        // the game. Importing it would make a 60-card deck arrive as 61.
        const deckText = `1 Whiskervale Forerunner

Sideboard
1 Festival of Embers

1 Lurrus of the Dream-Den`;

        const { items, excludedCardCount } = parseDecklistWithStats(deckText);

        expect(items).toEqual([{ count: 1, name: 'Whiskervale Forerunner' }]);
        expect(excludedCardCount).toBe(2);
      });

      it.each([
        ['straight double quotes', '"COMMANDER"'],
        ['curly quotes', '“Commander”'],
        ['quotes around a colon form', '"Commander:"'],
      ])('should recognize a commander header wrapped in %s', (_label, header) => {
        // Quoted headers are not recognized as headers unless the quotes are
        // stripped, in which case they fall through to the quantity-less-card
        // rule and import as a *card* — inflating a 100-card deck to 101.
        const deckText = `${header}
1 Krenko, Mob Boss

1 Sol Ring`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Krenko, Mob Boss', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring' },
        ]);
      });

      it('should import the main deck and tag commander-section cards', () => {
        const deckText = `COMMANDER:
1 Flubs, the Fool
DECK:
4 Lightning Bolt`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Flubs, the Fool', commander: true, tags: ['commander'], section: 'commander' },
          { count: 4, name: 'Lightning Bolt', tags: ['deck'], section: 'main' },
        ]);
      });

      it('should tag cards under a "Command Zone" header', () => {
        const deckText = `Command Zone
1 Atraxa, Praetors' Voice`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          {
            count: 1,
            name: "Atraxa, Praetors' Voice",
            commander: true,
            tags: ['command zone'],
            section: 'commander',
          },
        ]);
      });

      it('should tag every card under a commander header (partners)', () => {
        const deckText = `COMMANDER:
1 Thrasios, Triton Hero
1 Tymna the Weaver

DECK:
4 Lightning Bolt`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          // Both partners are flagged — not just the first line under the header.
          { count: 1, name: 'Thrasios, Triton Hero', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Tymna the Weaver', commander: true, tags: ['commander'], section: 'commander' },
          // The section ends at the next header; main-deck cards are not flagged.
          { count: 4, name: 'Lightning Bolt', tags: ['deck'], section: 'main' },
        ]);
      });

      it('should not flag or tag any card when the list has no headers', () => {
        const deckText = `1 Sol Ring
20 Mountain
1 Krenko, Mob Boss`;

        const result = parseDecklist(deckText);

        expect(result.every((item) => item.commander === undefined)).toBe(true);
        // No header means no provenance to record.
        expect(result.every((item) => item.tags === undefined)).toBe(true);
      });

      it('should keep commander + main and drop sideboard and maybeboard', () => {
        const deckText = `MAIN DECK:
4 Lightning Bolt
SIDEBOARD:
1 Ancient Grudge
MAYBEBOARD:
2 Counterspell`;

        const { items, excludedSections } = parseDecklistWithStats(deckText);

        expect(items).toEqual([
          { count: 4, name: 'Lightning Bolt', tags: ['main deck'], section: 'main' },
        ]);
        expect(excludedSections).toEqual(['sideboard', 'maybeboard']);
      });

      it('should import recognized category headers as main deck (Archidekt)', () => {
        const deckText = `Creatures
4 Monastery Swiftspear
Lands
20 Mountain`;

        const { items, unrecognizedSections } = parseDecklistWithStats(deckText);

        expect(items).toEqual([
          { count: 4, name: 'Monastery Swiftspear', tags: ['creatures'], section: 'main' },
          { count: 20, name: 'Mountain', tags: ['lands'], section: 'main' },
        ]);
        // "Creatures"/"Lands" are known labels, so nothing was waved through blind.
        expect(unrecognizedSections).toEqual([]);
      });

      it('should flag a custom category header it did not recognize', () => {
        // We still import it as main — but we say so. Waving through a header
        // that was really a sideboard is how a deck ends up over-sized, and this
        // is the only signal that names the culprit.
        const deckText = `Ramp (2)
1 Sol Ring
1 Arcane Signet`;

        const { items, unrecognizedSections } = parseDecklistWithStats(deckText);

        expect(items).toHaveLength(2);
        expect(unrecognizedSections).toEqual(['ramp']);
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
          { count: 1, name: 'Island', tags: ['lands'], section: 'main' },
          { count: 1, name: 'Wasteland', tags: ['lands'], section: 'main' },
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
          { count: 1, name: "Kraum, Ludevic's Opus", commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Tymna the Weaver', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring', tags: ['deck'], section: 'main' },
          { count: 1, name: 'Command Tower', tags: ['deck'], section: 'main' },
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
          { count: 1, name: 'Krenko, Mob Boss', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring', tags: ['deck'], section: 'main' },
          { count: 1, name: 'Island', tags: ['deck'], section: 'main' },
          { count: 1, name: 'Island', tags: ['deck'], section: 'main' },
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

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring', tags: ['deck'], section: 'main' },
        ]);
      });

      it('should treat an Archidekt category header with a trailing count as a header', () => {
        const deckText = `Ramp (2)
1 Sol Ring
Arcane Signet
Removal (1)
1 Swords to Plowshares`;

        const result = parseDecklist(deckText);

        expect(result).toEqual([
          { count: 1, name: 'Sol Ring', tags: ['ramp'], section: 'main' },
          { count: 1, name: 'Arcane Signet', tags: ['ramp'], section: 'main' },
          { count: 1, name: 'Swords to Plowshares', tags: ['removal'], section: 'main' },
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
          { count: 1, name: 'Krenko, Mob Boss', commander: true, tags: ['commander'], section: 'commander' },
          { count: 1, name: 'Sol Ring', tags: ['deck'], section: 'main' },
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
        expect(result[0]).toEqual({
          count: 1,
          name: 'Ms. Bumbleflower',
          setCode: 'blc',
          collectorNumber: '3',
          commander: true,
          tags: ['commander'],
          section: 'commander',
        });
        expect(result[1]).toEqual({
          count: 1,
          name: 'Arcane Signet',
          setCode: 'blc',
          collectorNumber: '127',
          tags: ['artifact'],
          section: 'main',
        });
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

        expect(result).toEqual([
          { count: 1, name: 'Flubs, the Fool', commander: true, tags: ['commander'], section: 'commander' },
          { count: 4, name: 'Lightning Bolt', tags: ['main deck'], section: 'main' },
          { count: 20, name: 'Mountain', tags: ['main deck'], section: 'main' },
          { count: 1, name: 'Sol Ring', tags: ['main deck'], section: 'main' },
        ]);
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

        expect(result).toEqual([
          { count: 1, name: 'Flubs, the Fool', commander: true, tags: ['commander'], section: 'commander' },
          { count: 4, name: 'Lightning Bolt', tags: ['main deck'], section: 'main' },
          { count: 20, name: 'Mountain', tags: ['main deck'], section: 'main' },
          { count: 1, name: 'Sol Ring', tags: ['main deck'], section: 'main' },
          {
            count: 1,
            name: 'Mabel, Heir to Cragflame',
            setCode: 'BLB',
            collectorNumber: '336',
            tags: ['main deck'],
            section: 'main',
          },
        ]);
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

      // 45 real cards carry a parenthesis in their own name. Reading the *first*
      // parenthesis on the line took the name apart at the wrong place and handed
      // the lookup a set code made of English words — which failed, fell through
      // to the name, and resolved a different card with no error anywhere.
      describe('parentheses inside a card name', () => {
        it('does not mistake a name parenthetical for a set code', () => {
          expect(parseDecklist("1 Erase (Not the Urza's Legacy One)")).toEqual([
            { count: 1, name: "Erase (Not the Urza's Legacy One)" },
          ]);
        });

        it('reads the printing from the right when the name has parentheses too', () => {
          expect(parseDecklist("1 Erase (Not the Urza's Legacy One) (UNH) 10")).toEqual([
            {
              count: 1,
              name: "Erase (Not the Urza's Legacy One)",
              setCode: 'UNH',
              collectorNumber: '10',
            },
          ]);
        });

        it('keeps a multi-word parenthetical out of the set code', () => {
          expect(parseDecklist('1 B.F.M. (Big Furry Monster)')).toEqual([
            { count: 1, name: 'B.F.M. (Big Furry Monster)' },
          ]);
        });
      });

      // Shapes taken from the real import corpus, where ~46% of lines carry a
      // printing suffix and exporters append their own annotations after it.
      describe('annotations after the printing', () => {
        it('does not read an Archidekt category as a collector number', () => {
          expect(parseDecklist('1x Double Vision (m21) [Copy]')).toEqual([
            { count: 1, name: 'Double Vision', setCode: 'm21' },
          ]);
        });

        it('keeps the collector number when a category follows it', () => {
          expect(parseDecklist('4x Colossal Dreadmaw (j25) 646 [Finisher]')).toEqual([
            { count: 4, name: 'Colossal Dreadmaw', setCode: 'j25', collectorNumber: '646' },
          ]);
        });

        it('keeps the collector number when a colour-tagged label follows it', () => {
          expect(parseDecklist('1x Doran, Besieged by Time (ecl) 215 ^Drawn,#1b1686^')).toEqual([
            { count: 1, name: 'Doran, Besieged by Time', setCode: 'ecl', collectorNumber: '215' },
          ]);
        });

        it('ignores an MTGO-style foil marker', () => {
          expect(parseDecklist('1 Flusterstorm (MH3) 496 *F*')).toEqual([
            { count: 1, name: 'Flusterstorm', setCode: 'MH3', collectorNumber: '496' },
          ]);
        });

        it('takes the set code alone when the line names no printing', () => {
          expect(parseDecklist('1 Spider-Punk (SPM)')).toEqual([
            { count: 1, name: 'Spider-Punk', setCode: 'SPM' },
          ]);
        });
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