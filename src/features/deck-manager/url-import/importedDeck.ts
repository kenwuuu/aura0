import { isRoundTrippablePrinting } from '../DeckListParser';
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
  /**
   * The exact printing this deck names, when the source says which one.
   *
   * Worth carrying because the lookup prefers it: a set code and collector number
   * ask the card API for one specific card, where a name has to be *resolved* —
   * and resolving is where cards get lost (a name the index spells differently, a
   * double-faced card written as "A // B", a name that needs escaping).
   *
   * Absent for sources that publish a plain text export and so never say which
   * printing they mean; a collector number can also be absent on its own, for a
   * source that names only the set.
   *
   * Adapters pass on whatever the source said and do not vet it. Deciding what
   * is safe to write belongs to `toDecklistText`, which is the only code that
   * knows what the text format can carry — putting the check there means a new
   * adapter cannot forget it.
   */
  setCode?: string;
  collectorNumber?: string;
};

/** A decklist retrieved from a deck-hosting site, before any card lookup. */
export type ImportedDeck = {
  /** The deck's name on the source site — offered as the default deck name. */
  name: string;
  source: DeckSource;
  cards: ImportedCard[];
  /**
   * How many cards the *source site itself* says this deck holds, when it says
   * so at all. Omitted for sources that publish no total (a plain-text export
   * has nothing to declare).
   *
   * This exists to catch a failure nothing else can see. The import counts in
   * `PosthogFunctions` (`requestedCardCount` vs `importedCardCount`) are both
   * measured *downstream of this adapter* — so if the adapter itself loses
   * cards, the decklist text shrinks with it and the two numbers still agree.
   * A board we don't map, a shape change upstream, an entry with a missing
   * name: every one of those is silent, and the deck just quietly arrives
   * smaller than the one the player linked.
   *
   * Comparing this against the quantities we actually emit is the only check
   * that closes that gap. Treat a mismatch as *our* bug, not the player's.
   */
  sourceCardCount?: number;
};

/** Total physical cards in an imported deck — the sum of quantities, not entries. */
export function totalCardCount(deck: ImportedDeck): number {
  return deck.cards.reduce((sum, card) => sum + card.quantity, 0);
}

/**
 * The printing fields of an `ImportedCard`, built from whatever a source gave.
 *
 * Every deck site types these loosely — a field can be missing, null, or an empty
 * string, and all three mean "this deck doesn't say" — so normalizing in one
 * place keeps each adapter from inventing its own idea of absent, and keeps an
 * empty string from reaching `toDecklistText` as a set code.
 *
 * A collector number with no set code is dropped: it identifies nothing on its
 * own, and the `bySet` lookup needs both.
 */
export function printing(
  setCode: unknown,
  collectorNumber: unknown,
): Pick<ImportedCard, 'setCode' | 'collectorNumber'> {
  const code = nonEmpty(setCode);
  if (code === undefined) {
    return {};
  }

  const number = nonEmpty(collectorNumber);
  return number === undefined ? { setCode: code } : { setCode: code, collectorNumber: number };
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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
    const lines = cards.map(cardLine);
    blocks.push([SECTION_HEADERS[section], ...lines].join('\n'));
  }

  return blocks.join('\n\n');
}

/**
 * One card line: `1 Sol Ring (ELD) 10`, or `1 Sol Ring` when the source named no
 * printing.
 *
 * `(SET) CN` is the shape every major exporter writes and the parser already
 * reads, so this adds nothing to the format — it stops throwing away what the
 * source told us. The player sees the printing they linked, and the lookup can
 * ask for that exact card instead of resolving its name.
 *
 * A printing the parser could not read back is dropped rather than written,
 * because an unreadable suffix does not come back as a missing set code — it
 * comes back welded to the card's name, and takes the name lookup down with it.
 */
function cardLine(card: ImportedCard): string {
  if (card.setCode === undefined
    || !isRoundTrippablePrinting(card.setCode, card.collectorNumber)) {
    return `${card.quantity} ${card.name}`;
  }

  const collectorNumber = card.collectorNumber === undefined ? '' : ` ${card.collectorNumber}`;
  return `${card.quantity} ${card.name} (${card.setCode})${collectorNumber}`;
}
