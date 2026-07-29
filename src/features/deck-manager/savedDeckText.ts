import { Card, SavedDeck } from '@/features/player/types';
import { ImportedCard, ImportedSection, toDecklistText } from './url-import';

/**
 * The decklist to put in the import dialog when a player edits a saved deck.
 *
 * Prefers the list the deck was imported from, kept verbatim on the record. That
 * text is the only thing that still knows which *printing* each line asked for:
 * a `Card` carries the printing it resolved to but no set code or collector
 * number, so anything rebuilt from cards is names and quantities alone. Reopening
 * the original means editing one line cannot silently repick the art on the other
 * ninety-nine.
 *
 * Decks saved before editing existed have no such text, so they are rebuilt from
 * their cards. That is a real downgrade — printings are gone and the re-import
 * resolves every name again — but it is the only list those decks can offer, and
 * offering it beats refusing to edit them.
 */
export function decklistTextForEditing(deck: SavedDeck): string {
  if (deck.decklistText !== undefined && deck.decklistText.trim().length > 0) {
    return deck.decklistText;
  }

  return toDecklistText({ cards: rebuildEntries(deck) });
}

/**
 * Collapse a saved deck's cards back into decklist entries.
 *
 * Saved cards are one object per physical card — a Commander deck is a hundred
 * of them — so this counts duplicates back into quantities. Sections come from
 * where the card is stored rather than from anything on the line: the command
 * zone is the `commander` flag the importer set, and the sideboard is its own
 * array.
 */
function rebuildEntries(deck: SavedDeck): ImportedCard[] {
  return [
    ...entriesFor(deck.cards.filter((card) => card.commander), 'commander'),
    ...entriesFor(deck.cards.filter((card) => !card.commander), 'main'),
    ...entriesFor(deck.sideboard ?? [], 'sideboard'),
  ];
}

/**
 * Count cards by name, keeping the order they were saved in.
 *
 * A card with no name is dropped: the name is what a decklist line *is*, and
 * one we cannot write is also one we could never look back up.
 */
function entriesFor(cards: Card[], section: ImportedSection): ImportedCard[] {
  const quantities = new Map<string, number>();

  for (const card of cards) {
    const name = card.name?.trim();
    if (name === undefined || name.length === 0) {
      continue;
    }
    quantities.set(name, (quantities.get(name) ?? 0) + 1);
  }

  return [...quantities].map(([name, quantity]) => ({ name, quantity, section }));
}
