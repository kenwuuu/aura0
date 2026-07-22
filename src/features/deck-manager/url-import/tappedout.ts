import { isSideboardCard, parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
import { ImportedCard, ImportedDeck } from './importedDeck';

/**
 * Adapter for TappedOut's plain-text deck export (`/mtg-decks/<slug>/?fmt=txt`).
 *
 * Unlike Archidekt there is no JSON document to pick apart — TappedOut hands
 * back a decklist in very nearly the format Aura already reads, complete with a
 * `Sideboard:` header the parser recognizes. So this adapter runs the export
 * through that same parser rather than writing a second one, and only has to
 * translate the parser's sections into ours.
 *
 * What the export does *not* carry is any marking of the command zone. A
 * TappedOut deck therefore imports with no commander, and the player sets one
 * themselves — that is a limit of the export, not something to guess at, since
 * guessing wrong deals a card into the opening hand that they never chose.
 */

/** A `?fmt=txt` response that is actually a web page — a private or missing deck. */
function looksLikeHtml(body: string): boolean {
  return /^\s*(?:<!doctype|<html|<\?xml)/i.test(body);
}

export function extractTappedOutDeck(slug: string, body: string): ImportedDeck {
  if (looksLikeHtml(body)) {
    throw new Error(
      "That TappedOut deck couldn't be read. Check the link, and that the deck is public.",
    );
  }

  const parsed = parseDecklistWithStats(body);

  const cards: ImportedCard[] = parsed.items.map((item) => ({
    name: item.name,
    quantity: item.count,
    // The export marks no command zone, so everything it lists is deck.
    section: 'main' as const,
  }));

  // The parser already knows which excluded sections are a real sideboard (cards
  // the player can bring into a game) and which are notes to drop.
  for (const item of parsed.excluded) {
    if (isSideboardCard(item)) {
      cards.push({ name: item.name, quantity: item.count, section: 'sideboard' });
    }
  }

  if (cards.length === 0) {
    throw new Error('That TappedOut deck has no cards we can import. It may be empty or private.');
  }

  return { name: deckNameFromSlug(slug), source: 'tappedout', cards };
}

/**
 * Make a deck name out of the URL slug.
 *
 * The text export carries no title, and fetching the deck page just to read one
 * would mean pulling ~300KB of HTML for a single string. The slug is what the
 * player already sees in their address bar, so it is the honest fallback — and
 * they can rename the deck before importing anyway.
 */
export function deckNameFromSlug(slug: string): string {
  const words = slug
    // TappedOut prefixes many decks with the date they were created. Only a
    // date-shaped prefix is dropped, so a deck really named "117-of-the-time"
    // keeps its number.
    .replace(/^\d{2}-\d{2}-\d{2}-/, '')
    .split(/[-_]+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return 'TappedOut deck';
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
