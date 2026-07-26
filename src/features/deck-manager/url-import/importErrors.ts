/**
 * What we tell a player when a deck link doesn't import, and what we suggest
 * they do about it.
 *
 * Like `deckUrls.ts`, this module is imported by **both** the browser and the
 * Cloudflare Worker, and for the same kind of reason: a failure can be
 * classified in either place — the Worker knows the upstream status, the client
 * knows whether it could reach the Worker at all — but there must be exactly one
 * author of the sentence the player reads. Splitting the copy across the two
 * would drift, and the drift would be invisible, because nobody sees both halves
 * at once.
 *
 * Two rules the copy here follows:
 *
 *  - **No jargon and no numbers.** "502", "upstream", "endpoint", "parse" name
 *    the shape of our system, which the player has no model of and no way to act
 *    on. A status code that is genuinely useful for a bug report rides in
 *    `detail`, deliberately apart from the sentence.
 *  - **Every problem carries fixes.** A message that only says what went wrong
 *    leaves the player with one move — retry — which for most of these fails
 *    identically forever. That is exactly what happened in #174: two players hit
 *    the same deck three times each and gave up, when the fix (make the deck
 *    public, or paste the list) was one sentence away.
 *
 * The fixes are *best guesses*, ordered most-likely-first. We usually can't tell
 * a deleted deck from a private one from a typo — the site answers all three
 * with the same 404 — so we name them all rather than pick one and be confidently
 * wrong.
 */

import { DeckSource, sourceLabel } from './deckUrls';

/**
 * Why an import failed, at the granularity a *player* can act on.
 *
 * These are not HTTP statuses with new names. `deck_not_found` and
 * `deck_private` both arrive as failures from the same site but call for
 * different actions, while a 500 and a 503 call for the same one and so share
 * `source_unavailable`. Grouping by remedy rather than by cause is what lets the
 * failure-rate metric mean something too: the `deck_*` reasons are the player's
 * to fix and belong in the expected tail, the `source_*` and `aura_*` ones are
 * ours and are what an alert should watch (#174).
 */
export type DeckImportReason =
  /** The pasted text isn't a deck link we recognize. */
  | 'link_not_supported'
  /** The site says no such deck — deleted, mistyped, or private to anonymous callers. */
  | 'deck_not_found'
  /** The site says the deck exists but isn't ours to read. */
  | 'deck_private'
  /** We read the deck and it held no cards. */
  | 'deck_empty'
  /** We read something back but couldn't find a deck in it. */
  | 'deck_unreadable'
  /** The site is throttling us. */
  | 'source_rate_limited'
  /** The site answered, badly — their outage, not ours. */
  | 'source_unavailable'
  /** The site never answered in time. */
  | 'source_unreachable'
  /** Our own rate gate shed the request to stay inside a shared budget. */
  | 'import_queue_busy'
  /** This deployment holds no credential for a source that needs one. */
  | 'source_not_configured'
  /** The browser couldn't reach Aura's own server. */
  | 'aura_unreachable'
  /** Anything we didn't foresee. Always our fault, never described as the player's. */
  | 'aura_error';

/** A failure, in the form the dialog renders: one sentence, then what to try. */
export type DeckImportProblem = {
  reason: DeckImportReason;
  /** One sentence, in the player's terms: what happened. */
  message: string;
  /** Best guesses at what would fix it, most likely first. Never empty. */
  fixes: string[];
  /**
   * A short technical aside — a status code, say. Shown small and last, so it is
   * there to quote in a bug report without ever being the thing the player has
   * to read first.
   */
  detail?: string;
};

/** An import failure carrying its own player-facing explanation. */
export class DeckImportError extends Error {
  readonly problem: DeckImportProblem;

  constructor(problem: DeckImportProblem) {
    super(problem.message);
    this.name = 'DeckImportError';
    this.problem = problem;
  }
}

/** Build the error to throw for a reason. */
export function deckImportError(
  reason: DeckImportReason,
  options: { source?: DeckSource; detail?: string } = {},
): DeckImportError {
  return new DeckImportError(deckImportProblem(reason, options));
}

/**
 * The site's name, or a stand-in when we failed before knowing which site it is
 * (an unrecognized link has no source).
 */
function siteName(source: DeckSource | undefined): string {
  return source === undefined ? 'the deck site' : sourceLabel(source);
}

/**
 * The fallback that works when nothing else does, and the reason it is worth
 * repeating on almost every problem: a deck link is a convenience, and a player
 * stuck on one has no way of knowing the plain-text path was there all along.
 */
function pasteTheListInstead(site: string): string {
  return `Or copy the deck list off ${site} and paste the text here instead.`;
}

/** Turn a reason into the words a player reads. */
export function deckImportProblem(
  reason: DeckImportReason,
  options: { source?: DeckSource; detail?: string } = {},
): DeckImportProblem {
  const site = siteName(options.source);
  const { message, fixes } = describe(reason, site);

  return {
    reason,
    message,
    fixes,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
  };
}

function describe(
  reason: DeckImportReason,
  site: string,
): { message: string; fixes: string[] } {
  switch (reason) {
    case 'link_not_supported':
      return {
        message: "That doesn't look like a deck link Aura knows how to read.",
        fixes: [
          'Paste a link from Archidekt, Moxfield, TappedOut, MTGGoldfish or EDHREC.',
          'Check the link points at a deck itself, like https://archidekt.com/decks/24569510 — a profile or folder page has no single deck on it.',
          'Or paste your deck list as text, one card per line.',
        ],
      };

    case 'deck_not_found':
      // The commonest real failure, and the one players read as a bug in Aura.
      // The middle fix is the whole point: a private deck opens perfectly for
      // its owner and 404s for us, so "but it works when I click it" is the
      // expected experience rather than evidence against the diagnosis.
      return {
        message: `Aura couldn't find that deck on ${site}.`,
        fixes: [
          `Open the link in a new tab. If ${site} says the deck doesn't exist, the link is wrong or the deck has been deleted.`,
          `If it opens fine for you, the deck is probably private — Aura visits ${site} as a stranger, so it can only read decks that are public or unlisted. Change the deck's visibility and paste the link again.`,
          pasteTheListInstead(site),
        ],
      };

    case 'deck_private':
      return {
        message: `That deck is private on ${site}, so Aura isn't allowed to read it.`,
        fixes: [
          `Open the deck on ${site}, set its visibility to public or unlisted, then paste the link again.`,
          pasteTheListInstead(site),
        ],
      };

    case 'deck_empty':
      return {
        message: `Aura opened that deck on ${site}, but there were no cards in it.`,
        fixes: [
          `Check the deck actually has cards saved on ${site} — an empty deck there imports as an empty deck here.`,
          'If the cards are all in a maybeboard or wishlist, move them into the deck itself. Those sections are ideas rather than the deck, so Aura leaves them behind.',
          pasteTheListInstead(site),
        ],
      };

    case 'deck_unreadable':
      return {
        message: `Aura reached that deck on ${site}, but couldn't make sense of what came back.`,
        fixes: [
          `If you were editing the deck, save it on ${site} and try again in a minute — a deck caught mid-edit can come through incomplete.`,
          pasteTheListInstead(site),
          `If it keeps happening, ${site} has probably changed something on their end and this needs a fix from us.`,
        ],
      };

    case 'source_rate_limited':
      return {
        message: `${site} is asking Aura to slow down — it's seen too many requests at once.`,
        fixes: [
          'Wait a minute or so, then paste the link again.',
          pasteTheListInstead(site),
        ],
      };

    case 'source_unavailable':
      return {
        message: `${site} is having trouble right now. This one's on their end, not yours.`,
        fixes: [
          `Open ${site} in another tab to see whether the whole site is down.`,
          'Try again in a few minutes.',
          pasteTheListInstead(site),
        ],
      };

    case 'source_unreachable':
      return {
        message: `${site} took too long to answer, so Aura stopped waiting.`,
        fixes: [
          'Try again — this is usually a blip that clears on its own.',
          `If ${site} won't load in another tab either, wait for them to come back.`,
          pasteTheListInstead(site),
        ],
      };

    case 'import_queue_busy':
      return {
        message: `A lot of ${site} decks are being imported right now, and yours didn't get through.`,
        fixes: [
          'Wait a few seconds and paste the link again.',
          pasteTheListInstead(site),
        ],
      };

    case 'source_not_configured':
      // A deployment fault. Named as ours rather than dressed up as a deck
      // problem, so nobody spends ten minutes making a public deck more public.
      return {
        message: `${site} imports aren't switched on in this version of Aura. Nothing you did caused this.`,
        fixes: [
          pasteTheListInstead(site),
          'Try a link from another deck site — the rest still work.',
        ],
      };

    case 'aura_unreachable':
      // The one case where "paste the list instead" would be a lie: the card
      // lookup needs the network too.
      return {
        message: "Aura couldn't reach its own server to look that deck up.",
        fixes: [
          'Check your internet connection, then paste the link again.',
          'If you use an ad blocker or a privacy extension, allow aura0.app and reload the page.',
          "If you're on office or school Wi-Fi, it may be blocking us.",
        ],
      };

    case 'aura_error':
      return {
        message: 'Something went wrong on our end while importing that deck.',
        fixes: [
          'Paste the link again — this often clears on a second try.',
          pasteTheListInstead(site),
        ],
      };
  }
}

/**
 * The problem behind an unknown thrown value.
 *
 * Everything we raise deliberately is a `DeckImportError` and keeps its own
 * words. Anything else got here by accident and must not reach the dialog: a
 * `TypeError` message is a sentence about our source code, and the player would
 * read it as something they had done wrong.
 */
export function problemOf(
  error: unknown,
  fallback: { source?: DeckSource } = {},
): DeckImportProblem {
  return error instanceof DeckImportError
    ? error.problem
    : deckImportProblem('aura_error', fallback);
}

/**
 * The wire shape of a failure from `/api/deck-import`.
 *
 * `error` is the message and stays first for a reason: it is the field the
 * client read before any of this existed, and an older client meeting a newer
 * Worker still shows the player a real sentence rather than a status code.
 */
export type DeckImportErrorBody = {
  error: string;
  reason: DeckImportReason;
  fixes: string[];
  detail?: string;
};

/** Narrow a parsed response body to a failure we can render as one. */
export function isDeckImportErrorBody(value: unknown): value is DeckImportErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as Partial<DeckImportErrorBody>;
  return (
    typeof body.error === 'string' &&
    typeof body.reason === 'string' &&
    Array.isArray(body.fixes) &&
    body.fixes.every((fix) => typeof fix === 'string')
  );
}

/**
 * Read a failed response body as a problem.
 *
 * Three cases, and the middle one is the reason this exists rather than a bare
 * type guard:
 *
 *  - The full shape — repeated verbatim. The server diagnosed it; re-deriving a
 *    reason here from a status code would only be a worse guess.
 *  - A body carrying `error` alone, which is what every reply looked like before
 *    reasons existed. Its sentence is kept and generic fixes are added, so a
 *    browser running a build newer than the Worker it is talking to still shows
 *    the real explanation instead of throwing it away for "something went wrong".
 *  - Anything else — HTML from a captive portal, an empty body — where there is
 *    no sentence to salvage and the generic failure is all we have.
 */
export function problemFromBody(
  body: unknown,
  fallback: { source?: DeckSource; detail?: string } = {},
): DeckImportProblem {
  if (isDeckImportErrorBody(body)) {
    return {
      reason: body.reason,
      message: body.error,
      fixes: body.fixes,
      ...(body.detail === undefined ? {} : { detail: body.detail }),
    };
  }

  const generic = deckImportProblem('aura_error', fallback);
  const message = (body as { error?: unknown } | null)?.error;

  return typeof message === 'string' && message.length > 0
    ? { ...generic, message }
    : generic;
}
