import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
import { DeckSource } from './deckUrls';
import { ImportedCard, ImportedDeck } from './importedDeck';

/**
 * Adapters for EDHREC's two kinds of deck page.
 *
 * Both hand back a decklist as an array of `"1 Card Name"` strings *and* name
 * the commanders outright, which no other source does — Archidekt infers the
 * command zone from a user-invented category, and TappedOut and MTGGoldfish
 * cannot say at all. So EDHREC decks import with the command zone already right.
 *
 *  - `/deckpreview/<hash>`   a real deck EDHREC has indexed. The page has no
 *                            JSON endpoint; it carries its data inline instead.
 *  - `/average-decks/<slug>` the deck EDHREC synthesizes for a commander, served
 *                            as JSON. Note these are *averages*, so they don't
 *                            always come to exactly 100 cards — the import
 *                            dialog's deck-size warning is what catches that.
 */

type EdhrecDeckData = {
  /** Card lines, already in `"1 Card Name"` form. */
  deck?: unknown;
  /** Exact card names of the commander(s) — one, or two for partners. */
  commanders?: unknown;
  header?: unknown;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Build a deck from EDHREC's card lines plus the names it says are commanders.
 *
 * The lines go through Aura's own parser rather than being split here, so
 * quantities and double-faced `"A // B"` names are read exactly as they are in a
 * pasted list. Commanders are then marked by *name*, not by position — EDHREC
 * happens to list them first today, and a card's identity is a far more durable
 * thing to match on than where it sits in an array.
 */
function buildDeck(
  data: EdhrecDeckData,
  source: DeckSource,
  fallbackName: string,
): ImportedDeck {
  const lines = asStringArray(data.deck);
  if (lines.length === 0) {
    throw new Error("That EDHREC page has no decklist we can import.");
  }

  const commanderNames = new Set(asStringArray(data.commanders).map(normalize));

  const cards: ImportedCard[] = parseDecklistWithStats(lines.join('\n')).items.map((item) => ({
    name: item.name,
    quantity: item.count,
    section: commanderNames.has(normalize(item.name)) ? ('commander' as const) : ('main' as const),
  }));

  if (cards.length === 0) {
    throw new Error("That EDHREC page has no decklist we can import.");
  }

  const header = typeof data.header === 'string' ? data.header.trim() : '';

  return { name: header.length > 0 ? header : fallbackName, source, cards };
}

/**
 * Pull the deck out of a `/deckpreview/` page.
 *
 * EDHREC is a Next.js site, so the page ships the same data its own JavaScript
 * renders from, in a `__NEXT_DATA__` script tag. Reading that is far steadier
 * than scraping the rendered markup: it is the site's own data contract rather
 * than its current layout, so a redesign doesn't break the import.
 */
export function extractEdhrecDeckPreview(html: string): ImportedDeck {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (match === null) {
    throw new Error("Couldn't read that EDHREC deck. The page may have moved.");
  }

  let payload: { props?: { pageProps?: { data?: EdhrecDeckData } } };
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new Error("Couldn't read that EDHREC deck. The page may have moved.");
  }

  const data = payload.props?.pageProps?.data;
  if (data === undefined) {
    throw new Error("Couldn't read that EDHREC deck. The page may have moved.");
  }

  return buildDeck(data, 'edhrec', 'EDHREC deck');
}

/** Pull the deck out of an `/average-decks/` JSON document. */
export function extractEdhrecAverageDeck(payload: unknown): ImportedDeck {
  const data = (payload ?? {}) as EdhrecDeckData & {
    container?: { json_dict?: { card?: { name?: unknown; names?: unknown } } };
  };

  // The average-deck document names its commander on the card it is *about*,
  // rather than in a `commanders` array like a deck preview does.
  const card = data.container?.json_dict?.card;
  const fullName = typeof card?.name === 'string' ? card.name : '';

  // Both a partner pair and a double-faced card put two names here, and the two
  // are indistinguishable at this level. Offering every spelling as a candidate
  // costs nothing, because only names that match an actual deck line are marked,
  // and it is what makes a double-faced commander work at all: the decklist
  // parser reduces "A // B" to its front face, so the full name alone would
  // never match and the commander would stay in the library.
  const candidates = [fullName, ...fullName.split('//'), ...asStringArray(card?.names)]
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return buildDeck(
    { ...data, commanders: candidates },
    'edhrec-average',
    fullName.length > 0 ? `Average ${fullName} deck` : 'EDHREC average deck',
  );
}
