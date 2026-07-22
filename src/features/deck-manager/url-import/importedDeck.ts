import { DeckSource } from './deckUrls';

/**
 * Where a card sat in the deck it was fetched from.
 *
 * This mirrors the zones Aura's text parser already understands rather than the
 * arbitrary category names a site lets its users invent, so every adapter has to
 * answer the same question — is this card in the deck, the command zone, or set
 * aside? — instead of leaking site-specific taxonomy downstream.
 */
export type ImportedSection = 'commander' | 'main' | 'sideboard' | 'maybeboard';

export type ImportedCard = {
  /** Card name as the source printed it, including the "A // B" double-faced form. */
  name: string;
  quantity: number;
  section: ImportedSection;
};

/** A decklist retrieved from a deck-hosting site, before any card lookup. */
export type ImportedDeck = {
  /** The deck's name on the source site — offered as the default deck name. */
  name: string;
  source: DeckSource;
  cards: ImportedCard[];
};

// The order sections are emitted in. `commander` must lead: the text parser ends
// the command zone at the next header, so the commanders have to be written
// before the deck rather than after it.
const SECTION_ORDER: ImportedSection[] = ['commander', 'main', 'sideboard', 'maybeboard'];

// Headers the text parser recognizes by exact label (see DeckListParser's
// COMMANDER_HEADERS / MAIN_HEADERS / EXCLUDED_HEADERS). Changing a value here
// silently reclassifies a whole section, so these are deliberately spelled out.
const SECTION_HEADERS: Record<ImportedSection, string> = {
  commander: 'Commander',
  main: 'Deck',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard',
};

/**
 * Render a fetched deck as a decklist in Aura's own text format.
 *
 * Going back through text rather than straight to card lookups is deliberate: it
 * puts URL imports on the exact pipeline that pasted lists already use — the
 * same parser, lookup, Scryfall fallback, sideboard handling and telemetry — so
 * a URL import cannot drift into a second, less-tested code path. It also means
 * the player sees the list in the box and can edit it before importing.
 *
 * The output is deliberately canonical: every card line carries an explicit
 * quantity, which is what makes it impossible for a card to be mistaken for a
 * section header. The parser classifies any line starting with a digit as a
 * card before it ever tries to match a header, so a card actually named
 * "Counters" or "Lands" survives the round trip.
 *
 * The maybeboard is emitted rather than dropped so the parser reports it as
 * excluded — the import telemetry counts what the source really held, not what
 * this function chose to forward.
 */
export function toDecklistText(deck: ImportedDeck): string {
  const blocks: string[] = [];

  for (const section of SECTION_ORDER) {
    const cards = deck.cards.filter((card) => card.section === section);
    if (cards.length === 0) {
      continue;
    }
    const lines = cards.map((card) => `${card.quantity} ${card.name}`);
    blocks.push([SECTION_HEADERS[section], ...lines].join('\n'));
  }

  return blocks.join('\n\n');
}
