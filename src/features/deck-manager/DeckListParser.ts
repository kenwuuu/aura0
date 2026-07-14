/**
 * How the importer should treat a card, based on the header it sat under.
 *  - `main`      : an ordinary deck/mainboard section, or an unrecognized header
 *  - `commander` : the command zone — its cards also carry `commander: true`
 *  - `excluded`  : a non-main section (sideboard, maybeboard, …)
 */
export type SectionKind = 'main' | 'commander' | 'excluded';

// Example: 1 Mabel, Heir to Cragflame (BLB) 336
export type DeckLineItem = {
  // Quantity of card
  count: number;
  // Card name, "Mabel, Heir to Cragflame"
  name: string;
  // Three to five-letter set code, "BLB"
  setCode?: string;
  // Number that points to a specific card when paired with a set code, e.g. "336"
  collectorNumber?: string;
  // Whether this card was under a commander header
  commander?: boolean;
  /**
   * The section header labels this card sat under, normalized and lowercased —
   * the card's provenance. Absent when the card sat under no header at all.
   */
  tags?: string[];
  /**
   * What that provenance means for the import. Absent is equivalent to `main`.
   *
   * The parser records where a card came from; it does not decide the card's
   * fate. That call belongs to the importer, and keeping the two apart is what
   * makes this correct by construction: there is no mutable "am I currently in
   * the sideboard?" flag left to get out of sync.
   */
  section?: SectionKind;
}

// A line that isn't a card and isn't a recognized header is treated as a
// quantity-less card. To keep that from swallowing section headers, headers are
// matched by their exact (normalized) label — never a substring — so cards like
// "Commander's Sphere" or "Island" (which contains "land") stay cards.
const COMMANDER_HEADERS = new Set(['commander', 'commanders', 'command zone']);

/**
 * Excluded sections that are a *sideboard* — cards the player owns and can bring
 * into the game, which the importer loads into the sideboard pile.
 *
 * A companion counts: by the rules it starts in the sideboard, and it is played
 * from there. The rest of `EXCLUDED_HEADERS` — maybeboard, wishlist, tokens —
 * are not cards in the player's 75; they are notes and printouts, and they stay
 * dropped. The distinction matters because everything here ends up in a real
 * game zone the player can pull cards out of.
 */
export const SIDEBOARD_HEADERS = new Set(['sideboard', 'side board', 'companion']);

const EXCLUDED_HEADERS = new Set([
  ...SIDEBOARD_HEADERS,
  'maybeboard', 'maybe board',
  'considering', 'consideration', 'wishlist', 'wish list',
  'tokens', 'token',
]);
const MAIN_HEADERS = new Set([
  'deck', 'decklist', 'main', 'maindeck', 'main deck', 'mainboard',
  'creature', 'creatures', 'land', 'lands', 'artifact', 'artifacts',
  'instant', 'instants', 'sorcery', 'sorceries', 'enchantment', 'enchantments',
  'planeswalker', 'planeswalkers', 'battle', 'battles', 'legendary', 'legendaries',
  'plane', 'planes', 'sticker', 'stickers', 'attraction', 'attractions',
  'counter', 'counters', 'nonbasic', 'basics', 'basic lands',
]);

/**
 * How many cards a command zone can hold: two, for partners or a commander and
 * its background.
 *
 * A list earns the second one by *saying where the command zone ends* — with a
 * blank line or a "Deck" header. That is the only evidence we have that a second
 * legendary is a partner rather than the first card of the deck, because a text
 * list carries no card types. So the bound is really two-tier:
 *
 *   Commander            Commander
 *   1 Thrasios           1 Sauron, Lord of the Rings
 *   1 Tymna              1 Anger                       <- no blank line, no
 *                        1 Arcane Denial                  "Deck" header, ever
 *   1 Sol Ring           ...
 *   ...
 *   ^ terminated:        ^ never terminated: the section would otherwise run to
 *     partners, both       the end and tag all 100 cards. `Player` draws every
 *     tagged.              commander-tagged card, so that hands the player their
 *                          entire deck. Overrunning the bound is the proof that
 *                          this list marks no boundary at all, so we keep the
 *                          first card and read the rest as deck.
 *
 * The conservative reading costs a partners player one drag from the deck. The
 * generous one puts a card they never chose into their opening hand, on a list
 * that gave us nothing to justify it.
 */
const MAX_COMMANDERS = 2;

/** A matched section header: its normalized label and what it means. */
type HeaderMatch = {
  label: string;
  kind: SectionKind;
  /** False when we imported it as main only because we didn't know the label. */
  recognized: boolean;
};

// How each line reads once section context is set aside.
type LineKind =
  | { kind: 'blank' }
  | { kind: 'comment' }
  | { kind: 'header'; header: HeaderMatch }
  | { kind: 'card'; item: DeckLineItem };

export type ParsedDecklist = {
  /** Cards to import — everything not under an excluded header. */
  items: DeckLineItem[];
  /**
   * Cards withheld because they sat under a sideboard/maybeboard-style header.
   *
   * Returned rather than silently discarded. A deck that imports as 60 cards
   * from a 75-line list is either a correct sideboard drop or a parser bug, and
   * the imported count alone cannot tell those apart. Handing back what we
   * deliberately withheld turns "the numbers don't add up" into an equation the
   * caller can actually check.
   */
  excluded: DeckLineItem[];
  /** Physical cards (summed quantities) in `excluded`. */
  excludedCardCount: number;
  /** Distinct excluded header labels, e.g. `["sideboard", "maybeboard"]`. */
  excludedSections: string[];
  /**
   * Header labels we did not recognize and therefore imported as main deck
   * (custom Archidekt categories and the like).
   *
   * Worth reporting on its own: an unrecognized header we wrongly wave through
   * as "main" is the likeliest way an import ends up with MORE cards than a
   * legal deck, and it is invisible in the card counts alone.
   */
  unrecognizedSections: string[];
};

/**
 * Parse a text decklist into card entries tagged with where they came from.
 *
 * Cards carry their section as provenance (`tags` / `section`); the parser
 * records where a card came from and applies only the bounds it can justify from
 * the list's own structure, and the caller applies policy.
 *
 * A section header runs until the **next header** — with one exception: a blank
 * line ends the command zone, once that zone has taken a card. Nothing else ends
 * a section, and comments never do. See the `blank` case below for why the
 * exception is exactly that narrow.
 *
 * Card lines may omit the leading quantity ("Sol Ring" == "1 Sol Ring"), which
 * is how singleton (Commander) exports list singletons and repeat basics one
 * per line.
 */
export function parseDecklistWithStats(text: string): ParsedDecklist {
  const items: DeckLineItem[] = [];
  const excluded: DeckLineItem[] = [];
  const excludedSections = new Set<string>();
  const unrecognizedSections = new Set<string>();

  let active: HeaderMatch | null = null;
  // Whether the active section has taken a card yet. A blank line only means
  // "section over" once the section has content — see the `blank` case below.
  let activeHasCards = false;
  let commanderCount = 0;
  // Cards tagged by the command zone currently open, so an overrun can take the
  // tag back — see the overflow branch below.
  let openCommanders: DeckLineItem[] = [];

  for (const rawLine of text.trim().split('\n')) {
    const parsed = classifyLine(rawLine);

    switch (parsed.kind) {
      case 'header':
        active = parsed.header;
        activeHasCards = false;
        openCommanders = [];
        if (!active.recognized) {
          unrecognizedSections.add(active.label);
        }
        break;

      case 'card': {
        const item = parsed.item;
        activeHasCards = true;

        if (active?.kind === 'commander' && commanderCount + item.count > MAX_COMMANDERS) {
          // The zone overran its limit, which means this list never marked where
          // the command zone ended — no blank line, no "Deck" header. With no
          // structure to read, the generous reading (partners) is a guess, and
          // guessing wrong puts a card the player never chose into their opening
          // hand. So take the conservative one: the first card is the commander,
          // everything after it is the deck. A player who wants partners can say
          // so by formatting the list.
          //
          // The overreach cards lose their provenance outright rather than being
          // re-tagged `main`: the conclusion here is that the command zone only
          // ever extended to the first card, so these were never in it — which
          // makes them indistinguishable from every card that follows, and they
          // should read that way.
          for (const overreach of openCommanders.slice(1)) {
            delete overreach.commander;
            delete overreach.tags;
            delete overreach.section;
          }
          openCommanders = [];
          active = null;
        }

        if (active) {
          item.tags = [active.label];
          item.section = active.kind;
          if (active.kind === 'commander') {
            item.commander = true;
            commanderCount += item.count;
            openCommanders.push(item);
          }
        }

        if (active?.kind === 'excluded') {
          excludedSections.add(active.label);
          excluded.push(item);
        } else {
          items.push(item);
        }
        break;
      }

      case 'blank':
        // A blank line ends the **command zone**, and only once that zone has
        // taken a card. It ends nothing else.
        //
        // That narrow rule is the one reading that satisfies every real export
        // we've seen, because a blank line means different things depending on
        // the section it follows, and the two sections fail in opposite
        // directions:
        //
        //   Commander:     <- a list that never re-opens with a "Deck" header.
        //   1 Atraxa          The blank is the only thing marking the command
        //                     zone as over; without it every remaining card is
        //   1 Sol Ring        tagged commander and `Player` draws the whole deck
        //   ...               into the opening hand. So the blank must end it.
        //
        //   Sideboard      <- exports put blanks *inside* the sideboard block.
        //   1 Duress          The sideboard has no size bound to overrun, so a
        //                     blank is no evidence it ended — and ending it here
        //   1 Mabel           imports every card below into the deck. That is how
        //                     a 100-card deck came out at 103. So the blank must
        //                     NOT end it; only the next header does.
        //
        // The qualifier ("once it has taken a card") handles the third shape — a
        // blank sitting directly *under* a header is padding, not a terminator,
        // so `Commander:` followed by a blank still tags the commander below it.
        //
        // A companion parked under the sideboard therefore stays excluded, which
        // is what we want: `companion` is itself an excluded header, and a
        // companion is a sideboard card by the rules of the game.
        //
        // Comments never end a section either — a comment inside a sideboard must
        // not leak the cards under it into the deck.
        if (active?.kind === 'commander' && activeHasCards) {
          active = null;
          activeHasCards = false;
          openCommanders = [];
        }
        break;

      default:
        // Comments carry no section meaning — they do not end the active one.
        break;
    }
  }

  return {
    items,
    excluded,
    excludedCardCount: excluded.reduce((sum, card) => sum + card.count, 0),
    excludedSections: [...excludedSections],
    unrecognizedSections: [...unrecognizedSections],
  };
}

/** Parse a text decklist into card entries. See {@link parseDecklistWithStats}. */
export function parseDecklist(text: string): DeckLineItem[] {
  return parseDecklistWithStats(text).items;
}

/**
 * Of the cards withheld from the deck, the ones that belong in the sideboard
 * pile — as opposed to a maybeboard or a token list, which are withheld and then
 * genuinely dropped. Reads the card's own provenance (`tags`), so the answer
 * comes from the header the player actually wrote.
 */
export function isSideboardCard(item: DeckLineItem): boolean {
  return item.section === 'excluded'
    && (item.tags?.some((tag) => SIDEBOARD_HEADERS.has(tag)) ?? false);
}

/**
 * Validate that the text looks like a decklist — i.e. it has at least one card
 * line (with or without a quantity), not just headers, comments, or blanks.
 */
export function validateFormat(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }
  return text.split('\n').some(line => classifyLine(line).kind === 'card');
}

// Classify a single raw line without regard to the active section.
function classifyLine(rawLine: string): LineKind {
  const line = rawLine.trim();
  if (line.length === 0) {
    return { kind: 'blank' };
  }

  // Card lines that start with a quantity, e.g. "4 Lightning Bolt" / "4x Sol Ring".
  if (/^\d/.test(line)) {
    return asCard(parseLine(line));
  }

  // A leading // or # may be a comment or a comment-style section header
  // (e.g. "// Commander", "# Sideboard").
  const marker = line.match(/^(?:\/\/|#)+\s*/);
  const body = marker ? line.slice(marker[0].length) : line;

  const header = matchHeader(body);
  if (header !== null) {
    return { kind: 'header', header };
  }
  if (marker) {
    // A // or # line that names no known section is just a comment.
    return { kind: 'comment' };
  }

  // Otherwise it's a quantity-less card line — treat as a single copy.
  return asCard(parseLine('1 ' + body));
}

function asCard(item: DeckLineItem): LineKind {
  if (isNaN(item.count) || item.name.length === 0) {
    return { kind: 'blank' };
  }
  return { kind: 'card', item };
}

// Recognize a section header by its exact normalized label, or by the
// Archidekt/MTGGoldfish category shape ("Ramp (10)", "[Ramp]"). Returns null
// when the line is not a header (so it will be read as a card).
function matchHeader(text: string): HeaderMatch | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const bracketed = /^\[.*\]$/.test(trimmed);
  const hasCountSuffix = /\(\d+\)\s*$/.test(trimmed);

  const label = trimmed
    .replace(/^\[|\]$/g, '')        // wrapping [ ] (Archidekt category)
    .replace(/\s*\(\d+\)\s*$/, '')  // trailing "(count)"
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')  // wrapping quotes, straight or curly
    .replace(/:\s*$/, '')           // trailing colon
    .trim()
    .toLowerCase();

  if (COMMANDER_HEADERS.has(label)) return { label, kind: 'commander', recognized: true };
  if (EXCLUDED_HEADERS.has(label)) return { label, kind: 'excluded', recognized: true };
  if (MAIN_HEADERS.has(label)) return { label, kind: 'main', recognized: true };

  // Unrecognized label, but the "(count)" or [bracket] wrapper marks it as a
  // category header rather than a card (covers custom Archidekt categories).
  // We wave it through as main — and say so, because doing that to a header
  // that was really a sideboard is how a deck ends up over-sized.
  if ((hasCountSuffix || bracketed) && label.length > 0) {
    return { label, kind: 'main', recognized: false };
  }

  return null;
}

function parseCount(firstPart: string): number {
  // Handle 'x' notation (e.g., "20x" -> "20")
  if (firstPart.toLowerCase().endsWith('x')) {
    firstPart = firstPart.slice(0, -1);
  }
  return parseInt(firstPart, 10);
}

function extractSetInfo(line: string): { setCode: string; collectorNumber: string } | null {
  const startIndex = line.indexOf('(');
  const endIndex = line.indexOf(')');

  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  const setCode = line.substring(startIndex + 1, endIndex);

  // Extract collector number - it's after the closing paren
  const afterParen = line.substring(endIndex + 1).trim();
  const collectorNumber = afterParen.split(/\s+/)[0];

  return { setCode, collectorNumber };
}

/**
 * Reduce a two-faced card's name to its front face: "Brazen Borrower // Petty
 * Theft" -> "Brazen Borrower".
 *
 * Exporters disagree — Moxfield writes the full "A // B" for double-faced, split,
 * and Adventure cards while others write only the front face — but the card API
 * indexes the front face, so the full name 404s and the lookup silently falls
 * through to Scryfall. Splitting on whitespace-delimited tokens (rather than a
 * bare substring) keeps a slash *inside* a name from being mistaken for a
 * separator.
 */
function stripBackFace(name: string): string {
  const words = name.split(/\s+/);
  const separator = words.findIndex((word) => word === '/' || word === '//');
  return separator === -1 ? name : words.slice(0, separator).join(' ');
}

function extractCardName(line: string, parts: string[]): string {
  const setInfo = extractSetInfo(line);

  if (setInfo) {
    // With set info, the name sits between the count and the opening paren. This
    // reads the raw line, so it has to strip the back face itself — slicing
    // `parts` would not reach it.
    const startIndex = line.indexOf('(');
    const countLength = parts[0].length;
    return stripBackFace(line.substring(countLength, startIndex).trim());
  }

  // No set info - just join all parts after the count
  return stripBackFace(parts.slice(1).join(' '));
}

function parseLine(line: string): DeckLineItem {
  line = line.trim()
  const parts = line.trim().split(/\s+/);
  const count = parseCount(parts[0]);
  const name = extractCardName(line, parts);
  const setInfo = extractSetInfo(line);

  if (setInfo) {
    return { count, name, setCode: setInfo.setCode, collectorNumber: setInfo.collectorNumber };
  }

  return { count, name };
}
