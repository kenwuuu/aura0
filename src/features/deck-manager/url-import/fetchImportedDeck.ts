import { trackDeckUrlImport } from '@/infrastructure/analytics/PosthogFunctions';
import { DeckUrlRef, sourceLabel } from './deckUrls';
import { ImportedDeck } from './importedDeck';

/**
 * Fetch a deck through Aura's own `/api/deck-import`.
 *
 * The request is same-origin and deliberately so — deck sites answer browsers
 * with CORS headers that make a direct fetch impossible, so the endpoint on the
 * other end of this call is what actually talks to them. See `src/worker/`.
 */
export async function fetchImportedDeck(
  ref: DeckUrlRef,
  signal?: AbortSignal,
): Promise<ImportedDeck> {
  const startedAt = Date.now();
  // Reported here rather than at the call site so every future caller is
  // measured without having to remember to be — the repeat rate this feeds is
  // only meaningful if it counts *all* upstream requests. An abort is excluded
  // throughout: it never reached the network, so it spent no rate budget.
  const report = (outcome: 'succeeded' | 'failed') =>
    trackDeckUrlImport({
      source: ref.source,
      deckId: ref.deckId,
      outcome,
      durationMs: Date.now() - startedAt,
    });

  const endpoint = `/api/deck-import?url=${encodeURIComponent(deckPageUrl(ref))}`;

  let response: Response;
  try {
    response = await fetch(endpoint, { signal });
  } catch (error) {
    // An aborted request is the caller withdrawing interest, not a failure —
    // it must not be reported to the player as one.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    report('failed');
    throw new Error("Couldn't reach Aura to look that deck up. Check your connection.");
  }

  // Errors carry a player-facing `error` string; anything else means the
  // endpoint itself is broken, and a status code is the most we can say.
  const payload = (await response.json().catch(() => null)) as
    | (ImportedDeck & { error?: string })
    | null;

  if (!response.ok) {
    report('failed');
    throw new Error(
      payload?.error ?? `Couldn't import that ${sourceLabel(ref.source)} deck (${response.status}).`,
    );
  }

  if (payload === null || !Array.isArray(payload.cards)) {
    report('failed');
    throw new Error("Aura returned a deck we couldn't read. Please try again.");
  }

  report('succeeded');
  return payload;
}

/** Rebuild the canonical deck page URL, which is what the endpoint expects. */
function deckPageUrl(ref: DeckUrlRef): string {
  switch (ref.source) {
    case 'archidekt':
      return `https://archidekt.com/decks/${ref.deckId}`;
    case 'tappedout':
      return `https://tappedout.net/mtg-decks/${ref.deckId}/`;
    case 'mtggoldfish':
      return `https://www.mtggoldfish.com/deck/${ref.deckId}`;
    case 'edhrec':
      return `https://edhrec.com/deckpreview/${ref.deckId}`;
    case 'edhrec-average':
      return `https://edhrec.com/average-decks/${ref.deckId}`;
    case 'moxfield':
      return `https://www.moxfield.com/decks/${ref.deckId}`;
  }
}
