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
const EXCLUDED_HEADERS = new Set([
  'sideboard', 'side board', 'maybeboard', 'maybe board',
  'considering', 'consideration', 'wishlist', 'wish list',
  'tokens', 'token', 'companion',
]);
const MAIN_HEADERS = new Set([
  'deck', 'decklist', 'main', 'maindeck', 'main deck', 'mainboard',
  'creature', 'creatures', 'land', 'lands', 'artifact', 'artifacts',
  'instant', 'instants', 'sorcery', 'sorceries', 'enchantment', 'enchantments',
  'planeswalker', 'planeswalkers', 'battle', 'battles', 'legendary', 'legendaries',
  'plane', 'planes', 'sticker', 'stickers', 'attraction', 'attractions',
  'counter', 'counters', 'nonbasic', 'basics', 'basic lands',
]);

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
 * A section header runs until the **next header** — blank lines and comments do
 * not end it. Cards carry their section as provenance (`tags` / `section`); the
 * parser never decides a card's fate, it only records one, and the caller
 * applies policy. That split is deliberate: the previous design tracked "which
 * section am I in?" as mutable state and reset it on a blank line, so a blank
 * inside `SIDEBOARD:` silently reopened the main deck and every card below it
 * was imported. There is no such flag to corrupt now.
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

  for (const rawLine of text.trim().split('\n')) {
    const parsed = classifyLine(rawLine);

    switch (parsed.kind) {
      case 'header':
        active = parsed.header;
        if (!active.recognized) {
          unrecognizedSections.add(active.label);
        }
        break;

      case 'card': {
        const item = parsed.item;

        if (active) {
          item.tags = [active.label];
          item.section = active.kind;
          if (active.kind === 'commander') {
            item.commander = true;
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

      default:
        // Blank lines and comments carry no section meaning — crucially, they do
        // not end the active one.
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
