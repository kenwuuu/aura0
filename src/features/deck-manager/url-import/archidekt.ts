import { ImportedCard, ImportedDeck, ImportedSection } from './importedDeck';

/**
 * Adapter for Archidekt's deck API (`archidekt.com/api/decks/<id>/`).
 *
 * The endpoint is public but undocumented — it is what the site's own front end
 * calls — so every field here is treated as optional and validated rather than
 * trusted. A shape change upstream should cost a player one clear error message,
 * not a stack trace or, worse, a silently half-imported deck.
 */

type ArchidektCategory = {
  name?: string | null;
  /**
   * False for categories the deck's owner has excluded from the deck proper —
   * this is how Archidekt models a maybeboard or sideboard. The category names
   * are user-invented, so this flag, not the name, decides what's in the deck.
   */
  includedInDeck?: boolean | null;
};

type ArchidektCardEntry = {
  quantity?: number | null;
  categories?: string[] | null;
  card?: {
    oracleCard?: {
      /** Double-faced cards arrive as the full "A // B" name, which is what we want. */
      name?: string | null;
    } | null;
  } | null;
};

export type ArchidektDeckResponse = {
  name?: string | null;
  categories?: ArchidektCategory[] | null;
  cards?: ArchidektCardEntry[] | null;
};

/** Category names that mean "command zone" rather than an ordinary deck category. */
const COMMANDER_CATEGORIES = new Set(['commander', 'commanders']);

/**
 * Excluded categories that hold real cards the player can bring into a game, and
 * so map to a sideboard rather than being dropped. Anything else the owner
 * excluded (maybeboard, considering, …) is a shortlist, not a card pool.
 */
const SIDEBOARD_CATEGORIES = new Set(['sideboard', 'side board', 'companion']);

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Convert Archidekt's deck document into Aura's source-agnostic shape.
 *
 * Throws when the response carries no usable cards — that is either a private
 * deck, a deleted one, or a shape change, and all three need to reach the player
 * as an error rather than as an empty deck.
 */
export function extractArchidektDeck(response: ArchidektDeckResponse): ImportedDeck {
  // Categories the owner marked as not part of the deck. Names are compared
  // normalized because they are free text typed by the deck's author.
  const excluded = new Set<string>();
  for (const category of response.categories ?? []) {
    if (category?.includedInDeck === false && typeof category.name === 'string') {
      excluded.add(normalize(category.name));
    }
  }

  const cards: ImportedCard[] = [];

  for (const entry of response.cards ?? []) {
    const name = entry?.card?.oracleCard?.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      // Custom cards (Archidekt lets users invent them) have no oracle card.
      // There is nothing to look up, so they cannot be imported.
      continue;
    }

    const quantity = entry?.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) {
      continue;
    }

    cards.push({
      name: name.trim(),
      quantity: Math.floor(quantity),
      section: sectionFor(entry?.categories ?? [], excluded),
    });
  }

  if (cards.length === 0) {
    throw new Error('That Archidekt deck has no cards we can import. It may be private or empty.');
  }

  const name = typeof response.name === 'string' ? response.name.trim() : '';

  return {
    name: name.length > 0 ? name : 'Archidekt deck',
    source: 'archidekt',
    cards,
  };
}

/**
 * Decide which zone a card belongs to from its categories.
 *
 * Exclusion wins over everything: a card the owner set aside is set aside even
 * if it also carries an ordinary category. Only then does the commander tag
 * apply — which keeps a card sitting in the maybeboard under a "Commander"
 * category from being dealt into the opening hand.
 */
function sectionFor(categories: string[], excluded: Set<string>): ImportedSection {
  const labels = categories.filter((c): c is string => typeof c === 'string').map(normalize);

  const excludedLabel = labels.find((label) => excluded.has(label));
  if (excludedLabel !== undefined) {
    return SIDEBOARD_CATEGORIES.has(excludedLabel) ? 'sideboard' : 'maybeboard';
  }

  return labels.some((label) => COMMANDER_CATEGORIES.has(label)) ? 'commander' : 'main';
}
