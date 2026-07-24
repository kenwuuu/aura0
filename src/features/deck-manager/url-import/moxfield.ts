import { ImportedCard, ImportedDeck, ImportedSection, printing } from './importedDeck';

/**
 * Adapter for Moxfield's deck API (`api.moxfield.com/v3/decks/all/<publicId>`).
 *
 * Unlike the other sources this one is reached with an approved User-Agent that
 * Moxfield issued to Aura; anonymous requests get a Cloudflare 403 rather than
 * any JSON at all. Nothing about that credential belongs here — this file only
 * has to turn a document into a decklist — but it is why a Moxfield fetch is
 * rate-limited globally (`src/worker/moxfieldGate.ts`).
 *
 * Every field is treated as optional and validated rather than trusted: v3 is
 * the endpoint Moxfield's own front end calls, not a documented contract, so a
 * shape change should cost a player one clear error message rather than a stack
 * trace or a silently half-imported deck.
 */

type MoxfieldCardEntry = {
  quantity?: number | null;
  card?: {
    /** Double-faced cards arrive as the full "A // B" name, which is what we want. */
    name?: string | null;
    /** Set code, lowercased ("eld"). Carried by every card of every deck sampled. */
    set?: string | null;
    /** Collector number. A string because they are not all numeric: "259p", "C15-56". */
    cn?: string | null;
  } | null;
};

type MoxfieldBoard = {
  /**
   * Keyed by the deck-entry id, not the card id — a deck can hold the same card
   * in two printings, which is two entries. Only the values matter here.
   */
  cards?: Record<string, MoxfieldCardEntry> | null;
  /**
   * Moxfield's own total for this board — a **sum of quantities, not a count of
   * entries**. A board with 97 entries reports 99 when two of them are
   * two-copy. Comparing it against `Object.keys(cards).length` will look like
   * missing cards and isn't; compare against summed quantities.
   */
  count?: number | null;
};

export type MoxfieldDeckResponse = {
  name?: string | null;
  boards?: Record<string, MoxfieldBoard | null> | null;
};

/**
 * Which Aura zone each Moxfield board maps to.
 *
 * Moxfield models zones as named boards rather than as per-card tags, so this is
 * the whole classification — there is no equivalent of Archidekt's user-invented
 * categories to normalize. `commanders` is the reason this source is worth
 * having: it states which card is the commander instead of leaving us to infer
 * it from a category name.
 *
 * A board missing from this map is deliberately *not* dropped — it falls through
 * to `maybeboard`, which is emitted and then reported as excluded by the parser.
 * That keeps a board we have never seen (Moxfield adds them as formats appear)
 * out of the player's opening hand without hiding it from the import counts.
 */
const BOARD_SECTIONS: Record<string, ImportedSection> = {
  mainboard: 'main',
  commanders: 'commander',
  // Oathbreaker's signature spell shares the command zone with its planeswalker.
  signatureSpells: 'commander',
  sideboard: 'sideboard',
  // A companion is a real card the player brings to the game, so it is a
  // sideboard card rather than a shortlist entry.
  companions: 'sideboard',
  maybeboard: 'maybeboard',
};

/**
 * Boards that hold things Aura does not import as deck cards.
 *
 * Tokens are generated from the card data Aura already has, so importing a
 * source's token board would add duplicates the player never asked for.
 */
const IGNORED_BOARDS = new Set(['tokens']);

/**
 * Convert Moxfield's deck document into Aura's source-agnostic shape.
 *
 * Throws when the response carries no usable cards — a private deck, a deleted
 * one, or a shape change, all of which need to reach the player as an error
 * rather than as an empty deck.
 */
export function extractMoxfieldDeck(response: MoxfieldDeckResponse): ImportedDeck {
  const cards: ImportedCard[] = [];
  // What Moxfield says these boards hold, accumulated alongside what we build
  // from them. Only the boards we actually import count toward it — including
  // the token board would guarantee a permanent phantom shortfall.
  let sourceCardCount = 0;

  for (const [boardName, board] of Object.entries(response?.boards ?? {})) {
    if (IGNORED_BOARDS.has(boardName)) {
      continue;
    }

    if (typeof board?.count === 'number' && Number.isFinite(board.count) && board.count > 0) {
      sourceCardCount += board.count;
    }

    const section = BOARD_SECTIONS[boardName] ?? 'maybeboard';

    for (const entry of Object.values(board?.cards ?? {})) {
      const name = entry?.card?.name;
      if (typeof name !== 'string' || name.trim().length === 0) {
        continue;
      }

      const quantity = entry?.quantity;
      if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) {
        continue;
      }

      cards.push({
        name: name.trim(),
        quantity: Math.floor(quantity),
        section,
        ...printing(entry?.card?.set, entry?.card?.cn),
      });
    }
  }

  if (cards.length === 0) {
    throw new Error('That Moxfield deck has no cards we can import. It may be private or empty.');
  }

  const name = typeof response?.name === 'string' ? response.name.trim() : '';

  return {
    name: name.length > 0 ? name : 'Moxfield deck',
    source: 'moxfield',
    cards,
    // Omitted rather than reported as 0 when no board declared a total — a zero
    // would read downstream as "the source says this deck is empty", which is a
    // different and much louder claim than "the source didn't say".
    ...(sourceCardCount > 0 ? { sourceCardCount } : {}),
  };
}
