import { trackDeckUrlImport } from '@/infrastructure/analytics/PosthogFunctions';
import { DeckUrlRef, sourceLabel } from './deckUrls';
import { ImportedDeck, totalCardCount } from './importedDeck';

/**
 * How long we'll honour a `Retry-After` before giving up and telling the player.
 *
 * The endpoint sheds a Moxfield request rather than queueing it past ~3s (see
 * `moxfieldGate.ts`), so anything it asks us to wait should be a few seconds.
 * Capped anyway: a `Retry-After` is a number from a server, and a wait longer
 * than a player will sit for is worse than an honest error.
 */
const MAX_RETRY_AFTER_MS = 6000;

/** Resolve after `ms`, or reject the moment the caller loses interest. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * How long the endpoint asked us to wait, in milliseconds.
 *
 * `Retry-After` is seconds. Returns null when the header is missing or isn't a
 * number, which means "don't retry" — retrying on a guess would spend a slot we
 * were never promised.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * Fetch a deck through Aura's own `/api/deck-import`.
 *
 * The request is same-origin and deliberately so — deck sites answer browsers
 * with CORS headers that make a direct fetch impossible, so the endpoint on the
 * other end of this call is what actually talks to them. See `src/worker/`.
 *
 * A 429 is retried once. Moxfield imports share a one-per-second budget across
 * every player (`src/worker/moxfieldGate.ts`), so two people importing different
 * decks in the same second is ordinary traffic rather than a real failure — and
 * the endpoint tells us exactly how long to wait. Waiting it out here keeps that
 * contention invisible instead of handing the player an error they can only fix
 * by doing the same thing again themselves.
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
  // Whether the rate gate shed this request at least once. Recorded even when
  // the retry then succeeds — otherwise contention is invisible, because a
  // successful retry looks identical to a request that never waited. This is
  // the number that says whether one request per second is actually enough.
  let wasRateLimited = false;

  const report = (outcome: 'succeeded' | 'failed', deck?: ImportedDeck) =>
    trackDeckUrlImport({
      source: ref.source,
      deckId: ref.deckId,
      outcome,
      durationMs: Date.now() - startedAt,
      wasRateLimited,
      sourceCardCount: deck?.sourceCardCount,
      // Measured from the deck we are about to hand back, so the comparison is
      // against what the player actually receives rather than what we intended
      // to build.
      extractedCardCount: deck === undefined ? undefined : totalCardCount(deck),
    });

  const endpoint = `/api/deck-import?url=${encodeURIComponent(deckPageUrl(ref))}`;

  let response: Response;
  try {
    response = await fetch(endpoint, { signal });

    // Shed for contention, not broken. One retry only: a second 429 means the
    // queue is genuinely saturated, and retrying into it would make that worse
    // for everyone waiting.
    if (response.status === 429) {
      wasRateLimited = true;
      const wait = retryAfterMs(response);
      if (wait !== null) {
        await delay(wait, signal);
        response = await fetch(endpoint, { signal });
      }
    }
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

  report('succeeded', payload);
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
