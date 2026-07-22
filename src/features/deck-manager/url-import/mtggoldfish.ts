import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
import { ImportedCard, ImportedDeck } from './importedDeck';

/**
 * Adapter for MTGGoldfish's deck download (`/deck/download/<id>`).
 *
 * The export is plain text, but it marks its sideboard in a way no header-based
 * parser can see: **a bare blank line, with no "Sideboard" label**. Everything
 * after that line is the sideboard.
 *
 * That detail is the whole reason this adapter exists rather than passing the
 * body straight through. Aura's decklist parser treats a blank line as the end
 * of a section, not the start of a sideboard, so an untouched MTGGoldfish export
 * would import its sideboard as maindeck — turning a legal 60-card deck into a
 * 75-card one, and doing it silently, because 75 is not an obviously wrong
 * number. Measured on a real export: 60 main + 15 sideboard.
 *
 * Like TappedOut, the export marks no command zone, so Commander decks import
 * with no commander rather than a guessed one.
 */

/** A download that is really a web page — a deleted deck, or a login wall. */
function looksLikeHtml(body: string): boolean {
  return /^\s*(?:<!doctype|<html|<\?xml)/i.test(body);
}

/**
 * Split the export at the blank line that separates deck from sideboard.
 *
 * Only a blank line that *follows* at least one card counts, so leading blank
 * lines can't produce an empty deck and a sideboard holding everything.
 */
export function splitOnBlankLine(body: string): { main: string; sideboard: string } {
  const lines = body.replace(/\r\n/g, '\n').split('\n');

  let seenCard = false;
  for (let i = 0; i < lines.length; i++) {
    const isBlank = lines[i].trim().length === 0;
    if (isBlank && seenCard) {
      return { main: lines.slice(0, i).join('\n'), sideboard: lines.slice(i + 1).join('\n') };
    }
    if (!isBlank) {
      seenCard = true;
    }
  }

  return { main: body, sideboard: '' };
}

export function extractMtgGoldfishDeck(body: string, deckName: string): ImportedDeck {
  if (looksLikeHtml(body)) {
    throw new Error(
      "That MTGGoldfish deck couldn't be read. Check the link, and that the deck is public.",
    );
  }

  const { main, sideboard } = splitOnBlankLine(body);

  // Each half still goes through Aura's parser, so quantity forms ("4x"), set
  // codes and double-faced names are read exactly as they are in a pasted list.
  const cards: ImportedCard[] = parseDecklistWithStats(main).items.map((item) => ({
    name: item.name,
    quantity: item.count,
    section: 'main' as const,
  }));

  for (const item of parseDecklistWithStats(sideboard).items) {
    cards.push({ name: item.name, quantity: item.count, section: 'sideboard' });
  }

  if (cards.length === 0) {
    throw new Error('That MTGGoldfish deck has no cards we can import. It may be empty or private.');
  }

  return { name: deckName, source: 'mtggoldfish', cards };
}

/**
 * Read the deck's name out of the download's `Content-Disposition`.
 *
 * MTGGoldfish sends it as `attachment; filename="Deck - Kozilek Voltron.txt"`,
 * which is the only place in the response the deck's real name appears — worth
 * reading, because the alternative is naming decks after a numeric id.
 */
export function deckNameFromContentDisposition(header: string | null): string {
  const fallback = 'MTGGoldfish deck';
  if (header === null) {
    return fallback;
  }

  // RFC 5987 `filename*` wins when present: it is percent-encoded UTF-8 and so
  // survives names the plain `filename` parameter would mangle.
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  const plain = /filename="([^"]*)"/i.exec(header) ?? /filename=([^;]+)/i.exec(header);

  let raw: string | undefined;
  if (encoded) {
    try {
      raw = decodeURIComponent(encoded[1]);
    } catch {
      raw = undefined;
    }
  }
  raw ??= plain?.[1];

  if (raw === undefined) {
    return fallback;
  }

  const name = raw
    .trim()
    .replace(/\.txt$/i, '')
    // Every filename is prefixed "Deck - "; it names the export, not the deck.
    .replace(/^Deck\s*-\s*/i, '')
    .trim();

  return name.length > 0 ? name : fallback;
}
