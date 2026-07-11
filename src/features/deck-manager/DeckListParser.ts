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
}

/**
 * Which part of a deck list the parser is currently reading.
 *  - `default`   : cards before any header (or a list with no headers at all)
 *  - `main`      : an ordinary deck/mainboard section, or an unrecognized header
 *  - `commander` : the command zone — its cards are tagged `commander: true`
 *  - `excluded`  : a non-main section (sideboard, maybeboard, …) — cards skipped
 */
type SectionType = 'default' | 'main' | 'commander' | 'excluded';

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

// How each line reads once section context is set aside.
type LineKind =
  | { kind: 'blank' }
  | { kind: 'comment' }
  | { kind: 'header'; section: SectionType }
  | { kind: 'card'; item: DeckLineItem };

/**
 * Parse a text decklist into card entries.
 *
 * Section headers are tolerated. If a list has headers, cards under a
 * non-main section (sideboard, maybeboard, …) are dropped while every other
 * section — the command zone, the main deck, and any unrecognized header — is
 * imported. A list with no headers imports every card line.
 *
 * Card lines may omit the leading quantity ("Sol Ring" == "1 Sol Ring"), which
 * is how singleton (Commander) exports list singletons and repeat basics one
 * per line.
 */
export function parseDecklist(text: string): DeckLineItem[] {
  const items: DeckLineItem[] = [];
  let section: SectionType = 'default';

  for (const rawLine of text.trim().split('\n')) {
    const parsed = classifyLine(rawLine);

    switch (parsed.kind) {
      case 'header':
        // Switch context for the card lines that follow.
        section = parsed.section;
        break;
      case 'card':
        // Blank lines and comments leave `section` untouched (a comment inside a
        // sideboard shouldn't leak its cards into the deck).
        if (section === 'excluded') {
          break;
        }
        if (section === 'commander') {
          parsed.item.commander = true;
        }
        items.push(parsed.item);
        break;
      default:
        break;
    }
  }

  return items;
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

  const section = matchHeader(body);
  if (section !== null) {
    return { kind: 'header', section };
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
function matchHeader(text: string): SectionType | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const bracketed = /^\[.*\]$/.test(trimmed);
  const hasCountSuffix = /\(\d+\)\s*$/.test(trimmed);

  const normalized = trimmed
    .replace(/^\[|\]$/g, '')        // wrapping [ ] (Archidekt category)
    .replace(/\s*\(\d+\)\s*$/, '')  // trailing "(count)"
    .replace(/:\s*$/, '')           // trailing colon
    .trim()
    .toLowerCase();

  if (COMMANDER_HEADERS.has(normalized)) return 'commander';
  if (EXCLUDED_HEADERS.has(normalized)) return 'excluded';
  if (MAIN_HEADERS.has(normalized)) return 'main';

  // Unrecognized label, but the "(count)" or [bracket] wrapper marks it as a
  // category header rather than a card (covers custom Archidekt categories).
  if ((hasCountSuffix || bracketed) && normalized.length > 0) return 'main';

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

function extractCardName(line: string, parts: string[]): string {
  // if name has a slash, remove the slash and anything after
  let slashIndex: number = parts.indexOf('/');
  const doubleSlashIndex: number = parts.indexOf('//');
  slashIndex = Math.min(slashIndex, doubleSlashIndex)
  if (slashIndex !== -1) parts = parts.slice(0, slashIndex);

  const setInfo = extractSetInfo(line);

  if (setInfo) {
    // If there's set info, extract name between count and opening paren
    const startIndex = line.indexOf('(');
    const countLength = parts[0].length;
    return line.substring(countLength, startIndex).trim();
  }

  // No set info - just join all parts after the count
  return parts.slice(1).join(' ');
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
