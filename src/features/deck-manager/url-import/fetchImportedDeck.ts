import { trackDeckUrlImport } from '@/infrastructure/analytics/PosthogFunctions';
import { DeckUrlRef } from './deckUrls';
import {
  DeckImportError,
  DeckImportProblem,
  DeckImportReason,
  deckImportProblem,
  problemFromBody,
} from './importErrors';
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

  const reportSuccess = (deck: ImportedDeck) =>
    trackDeckUrlImport({
      source: ref.source,
      deckId: ref.deckId,
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
      wasRateLimited,
      sourceCardCount: deck.sourceCardCount,
      // Measured from the deck we are about to hand back, so the comparison is
      // against what the player actually receives rather than what we intended
      // to build.
      extractedCardCount: totalCardCount(deck),
    });

  /**
   * Record a failure and return the error to throw for it.
   *
   * Recording and explaining are one step because they must not be able to
   * disagree. A binary `succeeded`/`failed` metric lumps "somebody pasted a
   * private deck" — inherent, and unfixable in code — together with "the adapter
   * broke", so a spike in the first is indistinguishable from the second at
   * exactly the moment you would want to tell them apart. That is what made the
   * headline Archidekt failure rate untrustworthy in #174, and `failure_reason`
   * is what separates the two.
   */
  const failed = (problem: DeckImportProblem): DeckImportError => {
    trackDeckUrlImport({
      source: ref.source,
      deckId: ref.deckId,
      outcome: 'failed',
      failureReason: problem.reason,
      durationMs: Date.now() - startedAt,
      wasRateLimited,
    });
    return new DeckImportError(problem);
  };

  /** The same, for a failure this side of the network diagnosed itself. */
  const failedBecause = (reason: DeckImportReason): DeckImportError =>
    failed(deckImportProblem(reason, { source: ref.source }));

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
    // The request never left the browser: no connection, or an extension
    // blocking it. Nothing upstream was involved, so nothing upstream is at
    // fault and the fixes must not send the player off to check their deck.
    throw failedBecause('aura_unreachable');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // The endpoint knows the upstream status and has already turned it into a
    // reason and its fixes, so its answer is repeated rather than re-diagnosed
    // here from a status code.
    throw failed(
      problemFromBody(payload, {
        source: ref.source,
        detail: `Aura's deck importer replied with status ${response.status}.`,
      }),
    );
  }

  const deck = payload as ImportedDeck | null;
  if (deck === null || !Array.isArray(deck.cards)) {
    throw failedBecause('aura_error');
  }

  reportSuccess(deck);
  return deck;
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
