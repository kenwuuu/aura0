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

// Headers whose cards must NOT be imported. Everything not matched here (and not
// the commander zone) is treated as part of the deck, so unusual/custom headers
// — e.g. Archidekt's per-type categories ("Creatures", "Lands") — still import.
const EXCLUDED_SECTION = /\b(sideboard|maybeboard|maybe board|consider(?:ing|ation)|wish\s?list|tokens?)\b/i;

// Headers that mark the command zone.
const COMMANDER_SECTION = /\b(commanders?|command zone)\b/i;

/**
 * Parse a text decklist into card entries.
 *
 * Section headers are tolerated. If a list has headers, cards under a
 * non-main section (sideboard, maybeboard, …) are dropped while every other
 * section — the command zone, the main deck, and any unrecognized header — is
 * imported. A list with no headers imports every card line.
 */
export function parseDecklist(text: string): DeckLineItem[] {
  const items: DeckLineItem[] = [];
  let section: SectionType = 'default';

  for (const rawLine of text.trim().split('\n')) {
    const line = rawLine.trim();

    // Blank lines and comments are ignored and do NOT change the active section
    // (a comment inside a sideboard shouldn't leak its cards into the deck).
    if (line.length === 0 || isComment(line)) {
      continue;
    }

    if (isCardLine(line)) {
      if (section === 'excluded') {
        continue;
      }
      const item = parseLine(line);
      if (isNaN(item.count) || item.name.length === 0) {
        continue;
      }
      if (section === 'commander') {
        item.commander = true;
      }
      items.push(item);
    } else {
      // A non-card, non-comment line is a section header: switch context for the
      // card lines that follow it.
      section = classifySection(line);
    }
  }

  return items;
}

/**
 * Validate if text is in decklist format
 * Format: "<count> <card name>" per line
 * Example: "4 Lightning Bolt" or "4x Lightning Bolt"
 */
export function validateFormat(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const lines = text.trim().split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return false;
  }

  // Check if at least one line matches the expected format
  const validLines = lines.filter(line => {
    const trimmed = line.trim();
    // Must start with a digit
    if (!/^\d/.test(trimmed)) {
      return false;
    }

    const parts = trimmed.split(/\s+/);
    let firstPart = parts[0];

    // Handle 'x' notation
    if (firstPart.toLowerCase().endsWith('x')) {
      firstPart = firstPart.slice(0, -1);
    }

    const count = parseInt(firstPart, 10);
    return !isNaN(count) && count > 0 && parts.length > 1;
  });

  return validLines.length > 0;
}

// Classify a section header line. Commander is checked first so a "Commander"
// header is never mistaken for the excluded set; anything unrecognized is
// treated as part of the main deck (imported).
function classifySection(header: string): SectionType {
  if (COMMANDER_SECTION.test(header)) return 'commander';
  if (EXCLUDED_SECTION.test(header)) return 'excluded';
  return 'main';
}

// Card lines start with a quantity, e.g. "4 Lightning Bolt" or "4x Sol Ring".
function isCardLine(line: string): boolean {
  return /^\d/.test(line);
}

// Common comment markers used by deck exporters.
function isComment(line: string): boolean {
  return line.startsWith('#') || line.startsWith('//');
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
