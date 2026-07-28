import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { DeckLineItem, stripBackFace } from '@/features/deck-manager/DeckListParser';
import { toCardDataResult } from './ScryfallCardAdapter';
import { CardDataResult, ScryfallCard } from './types';

export type CardApiEndpoints = {
  byId: (id: string) => string;
  byName: (name: string, attemptNumber: number) => string;
  bySet: (setCode: string, collectorNumber: string) => string;
};

/**
 * Why a lookup failed. The distinction that matters is `not_found` (the backend
 * answered, and the card genuinely isn't in its index) versus everything else
 * (the backend never got to answer). Collapsing the two is what let a month-long
 * Cloudflare outage read as a card-index coverage gap.
 */
export type LookupFailureReason =
  | 'not_found'
  | 'rate_limited'
  | 'blocked'
  | 'server_error'
  | 'network_or_blocked'
  | 'timeout'
  | 'unknown';

export type LookupFailure = {
  item: DeckLineItem;
  reason: LookupFailureReason;
  /** Absent when the response was never readable (see `network_or_blocked`). */
  status?: number;
};

export class CardApiError extends Error {
  readonly reason: LookupFailureReason;
  readonly status?: number;
  /** Parsed `Retry-After`, when the backend said how long to stay away. */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    reason: LookupFailureReason,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'CardApiError';
    this.reason = reason;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** How many times one request waits out a 429 before surfacing it, by default. */
const DEFAULT_THROTTLE_RETRIES = 4;
/** First wait after a 429, doubling each time, by default. */
const DEFAULT_THROTTLE_BACKOFF_MS = 500;
/**
 * Ceiling on a single wait. A backend that wants us gone for longer than this is
 * having an outage, and an import that stalls that long has already failed the
 * player — better to report the cards than to hang.
 */
const MAX_THROTTLE_BACKOFF_MS = 8000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * `Retry-After` is either a delay in seconds or an HTTP date. Absent, malformed,
 * and implausible values all fall through to our own backoff, so a bad header
 * can't stall an import.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.min(ms, MAX_THROTTLE_BACKOFF_MS);
}

function reasonForStatus(status: number): LookupFailureReason {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'blocked';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/**
 * `fetch` rejects with a TypeError for a network failure, a DNS failure, and —
 * critically — a response the browser blocks for CORS. A CORS-blocked response is
 * opaque: JS cannot read its status, so an edge block (a Cloudflare challenge, a
 * WAF rule) is indistinguishable from being offline. Both land in
 * `network_or_blocked`, which is why that bucket being non-zero is the signature
 * worth alerting on — it means requests aren't reaching us at all.
 */
function classifyError(err: unknown): LookupFailure['reason'] {
  if (err instanceof CardApiError) return err.reason;
  if (err instanceof Error && err.name === 'TimeoutError') return 'timeout';
  if (err instanceof TypeError) return 'network_or_blocked';
  return 'unknown';
}

function statusOf(err: unknown): number | undefined {
  return err instanceof CardApiError ? err.status : undefined;
}

/**
 * Whether the card an API returned is the card the line asked for.
 *
 * A set code and collector number are preferred over a name, which means a
 * *wrong* printing does not fail — it succeeds, with a different card.
 * `1 Erase (Not the Urza's Legacy One) (UNH) 45` resolves cleanly to Smart Ass,
 * because UNH 45 *is* Smart Ass. Nothing on that path errors and nothing is
 * logged; the player simply receives a card they never asked for. Printings are
 * also the part of a decklist most likely to be stale — names are typed by
 * people and rarely change, collector numbers are copied between exports and
 * renumbered between printings — so the two disagreeing is a real event, not a
 * hypothetical.
 *
 * Comparison is loose about presentation and strict about identity. Loose,
 * because the API answers a double-faced lookup with the full "A // B" while the
 * entry carries only the front face, and because accents survive some exports
 * and not others. Strict, because the two directions cost different amounts: a
 * false mismatch falls back to the name and still finds the right card, losing
 * only the exact printing, while a false match imports the wrong card silently.
 */
function namesAgree(requested: string, returned: string): boolean {
  return normalizeName(requested) === normalizeName(returned);
}

function normalizeName(name: string): string {
  return stripBackFace(name)
    .normalize('NFD')
    // Combining marks, so "Lim-Dûl's Vault" and "Lim-Dul's Vault" are one card.
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export type CardApiClientConfig = {
  name: string;
  baseUrl: string;
  rateLimit: {
    interval: number;
    intervalCap: number;
    timeout?: number;
    /** How many times a request waits out a 429 before giving up. */
    throttleRetries?: number;
    /** First wait after a 429; doubles on each subsequent one. */
    throttleBackoffMs?: number;
  };
  endpoints: CardApiEndpoints;
};

/**
 * A line whose printing resolved to a card the line did not name.
 *
 * Worth reporting rather than just repairing. This is the one import fault that
 * produces no error at any layer — the lookup succeeds, the deck is the right
 * size, and the only evidence is a card the player did not choose. Counting them
 * is how we find out whether decklists in the wild carry stale printings at a
 * rate worth caring about, and which sources produce them.
 */
export type PrintingMismatch = {
  /** The parsed line, carrying the set code and collector number that missed. */
  item: DeckLineItem;
  /** The card that printing actually is. */
  returnedName: string;
  /**
   * Which lookup supplied the card in the end. `name` is the ordinary repair;
   * `printing` means no card had that name and the mismatched one was kept —
   * rarer, and the more suspicious of the two.
   */
  resolvedBy: 'name' | 'printing';
};

export type FetchListResult = {
  results: CardDataResult[];
  failedItems: DeckLineItem[];
  /** Parallel to `failedItems`, but carries why each one failed. */
  failures: LookupFailure[];
  /** Lines whose printing named a different card. Empty on a clean import. */
  printingMismatches: PrintingMismatch[];
};

/**
 * Generic HTTP client for any card data API that returns Scryfall-shaped JSON.
 * Endpoint URL construction, rate limit, and base URL are injected via config —
 * this class owns only the rate-limiting, retry, and per-list iteration plumbing.
 */
export class CardApiClient {
  private readonly queue: PQueue;
  private readonly config: CardApiClientConfig;
  /** Non-null while the client is sitting out a 429. Shared by every waiter. */
  private throttleGate: Promise<void> | null = null;
  /** When the current pause lifts. A later 429 can push it further out. */
  private throttledUntil = 0;

  constructor(config: CardApiClientConfig) {
    this.config = config;
    this.queue = new PQueue({
      interval: config.rateLimit.interval,
      intervalCap: config.rateLimit.intervalCap,
      timeout: config.rateLimit.timeout ?? 30000,
    });
  }

  fetchById(scryfallId: string, retries = 3): Promise<ScryfallCard> {
    return this.lookup(
      () => this.config.endpoints.byId(scryfallId),
      retries,
      `ID "${scryfallId}"`,
    );
  }

  fetchByName(name: string, retries = 3): Promise<ScryfallCard> {
    return this.lookup(
      (attemptNumber) => this.config.endpoints.byName(name, attemptNumber),
      retries,
      `Card "${name}"`,
    );
  }

  fetchBySet(
    setCode: string,
    collectorNumber: string,
    retries = 3,
    nameForLogging?: string,
  ): Promise<ScryfallCard> {
    return this.lookup(
      () => this.config.endpoints.bySet(setCode, collectorNumber),
      retries,
      `Card "${nameForLogging ?? `${setCode}/${collectorNumber}`}"`,
    );
  }

  /**
   * Iterate a deck list, preferring bySet when set+collector are present,
   * falling back to byName within this same client when bySet fails.
   * Items that fail both lookups are returned in `failedItems` for upstream
   * fallback to a different client.
   *
   * Lookups are dispatched concurrently rather than one-at-a-time — the
   * `PQueue` in the constructor is what actually throttles requests to each
   * backend's rate limit, so fanning out here doesn't risk exceeding it, and
   * turns an N-card list into ~N/intervalCap round trips instead of N.
   */
  async fetchImagesForList(
    entries: DeckLineItem[],
    onProgress?: (current: number, total: number) => void,
    retries = 1,
  ): Promise<FetchListResult> {
    let completed = 0;

    const outcomes = await Promise.all(
      entries.map(async (entry) => {
        const outcome = await this.lookupEntry(entry, retries);
        completed++;
        onProgress?.(completed, entries.length);
        return { entry, outcome };
      }),
    );

    const results: CardDataResult[] = [];
    const failedItems: DeckLineItem[] = [];
    const failures: LookupFailure[] = [];
    const printingMismatches: PrintingMismatch[] = [];

    for (const { entry, outcome } of outcomes) {
      if (outcome.mismatch !== undefined) {
        printingMismatches.push(outcome.mismatch);
      }
      if (outcome.card) {
        results.push(toCardDataResult(outcome.card, entry.count, entry.commander, entry.section));
      } else {
        failedItems.push(entry);
        failures.push({ item: entry, reason: outcome.reason, status: outcome.status });
        results.push({
          count: entry.count,
          name: entry.name,
          type_line: undefined,
          scryfallId: '',
          imageUris: { front: null, back: null },
          commander: entry.commander,
          section: entry.section,
          error: `[${this.config.name}] lookup failed for "${entry.name}" (${outcome.reason})`,
        });
      }
    }

    return { results, failedItems, failures, printingMismatches };
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPendingCount(): number {
    return this.queue.pending;
  }

  /**
   * Resolves one entry, reporting *why* it failed rather than just that it did.
   * When both the set and name lookups are tried, the name lookup's reason wins —
   * it's the attempt that actually decided the outcome.
   *
   * The printing is preferred, but only while it agrees with the name; see
   * {@link namesAgree} for why disagreement is the dangerous case rather than the
   * harmless one.
   */
  private async lookupEntry(
    entry: DeckLineItem,
    retries: number,
  ): Promise<{
    card?: ScryfallCard;
    reason: LookupFailureReason;
    status?: number;
    mismatch?: PrintingMismatch;
  }> {
    // Set when the printing resolved to a card that isn't the one the line named.
    let mismatched: ScryfallCard | undefined;
    let printingError: unknown;

    if (entry.setCode && entry.collectorNumber) {
      try {
        const card = await this.fetchBySet(
          entry.setCode,
          entry.collectorNumber,
          retries,
          entry.name,
        );
        if (namesAgree(entry.name, card.name)) {
          return { card, reason: 'unknown' };
        }
        mismatched = card;
        console.warn(
          `[${this.config.name}] ${entry.setCode}/${entry.collectorNumber} is "${card.name}", `
          + `not "${entry.name}" — trying the name instead`,
        );
      } catch (err) {
        printingError = err;
      }
    }

    // Reached because there was no printing to try, because it failed, or because
    // it answered with a different card.
    try {
      const card = await this.fetchByName(entry.name, retries);
      return {
        card,
        reason: 'unknown',
        ...(mismatched === undefined
          ? {}
          : { mismatch: { item: entry, returnedName: mismatched.name, resolvedBy: 'name' } }),
      };
    } catch (err) {
      if (mismatched !== undefined) {
        // The name found nothing, so the printing is the only card we have. A card
        // from the printing the list named beats no card at all — this is the shape
        // a renamed card takes, where the old name is dead and the printing is not.
        console.warn(
          `[${this.config.name}] no card named "${entry.name}"; keeping `
          + `"${mismatched.name}" from ${entry.setCode}/${entry.collectorNumber}`,
        );
        return {
          card: mismatched,
          reason: 'unknown',
          mismatch: { item: entry, returnedName: mismatched.name, resolvedBy: 'printing' },
        };
      }

      console.error(
        printingError === undefined
          ? `[${this.config.name}] name lookup failed for "${entry.name}"`
          : `[${this.config.name}] both set and name lookups failed for "${entry.name}"`,
        printingError === undefined ? err : { primary: printingError, fallback: err },
      );
      return { reason: classifyError(err), status: statusOf(err) };
    }
  }

  /**
   * Runs a lookup, retrying it *through* the queue rather than around it.
   *
   * `attemptNumber` is which question to ask — Scryfall wants an exact name
   * first and a fuzzy one after — so it may only advance once the backend has
   * actually answered. Being throttled is not an answer, which is why 429s are
   * absorbed by {@link request} below and never reach this counter.
   */
  private lookup(
    urlForAttempt: (attemptNumber: number) => string,
    retries: number,
    label: string,
  ): Promise<ScryfallCard> {
    return pRetry((attemptNumber) => this.request(urlForAttempt(attemptNumber), label), {
      retries,
      onFailedAttempt: (error) => {
        console.warn(
          `[${this.config.name}] attempt ${error.attemptNumber} failed for ${label}. ${error.retriesLeft} retries left.`,
        );
      },
    });
  }

  /**
   * One logical request: queued, and transparently waiting out any throttling.
   *
   * Every attempt goes through `queue`, retries included. The version this
   * replaces queued the whole retry chain as a single task, so one slot could
   * fire several requests and the real rate ran at a multiple of the configured
   * cap. That earned 429s on exactly the imports that needed the backend most —
   * and since a 429 then consumed the exact→fuzzy retry budget, names the
   * backend would have resolved came back as "not found" and the cards were
   * silently dropped.
   */
  private async request(url: string, label: string): Promise<ScryfallCard> {
    const limit = this.config.rateLimit.throttleRetries ?? DEFAULT_THROTTLE_RETRIES;

    for (let waited = 0; ; waited++) {
      try {
        return (await this.queue.add(() => this.requestJson(url, label))) as ScryfallCard;
      } catch (err) {
        if (waited >= limit || classifyError(err) !== 'rate_limited') throw err;
        await this.waitOutThrottle(err, waited);
      }
    }
  }

  /**
   * Pauses the whole queue until the backend is ready for us again.
   *
   * A 429 is a statement about this client, not about one card: everything
   * queued behind the throttled request is over the same budget, so letting it
   * through while this one sleeps just earns more 429s. Overlapping 429s share
   * one pause and push its deadline out rather than cutting each other short.
   */
  private waitOutThrottle(err: unknown, waited: number): Promise<void> {
    const base = this.config.rateLimit.throttleBackoffMs ?? DEFAULT_THROTTLE_BACKOFF_MS;
    const backoff =
      err instanceof CardApiError && err.retryAfterMs !== undefined
        ? err.retryAfterMs
        : Math.min(base * 2 ** waited, MAX_THROTTLE_BACKOFF_MS);

    this.throttledUntil = Math.max(this.throttledUntil, Date.now() + backoff);
    this.queue.pause();

    // `.finally` runs on a later microtask, so the field is always assigned
    // before anything can clear it.
    this.throttleGate ??= this.sleepUntilThrottleLifts().finally(() => {
      this.throttleGate = null;
      this.throttledUntil = 0;
      this.queue.start();
    });

    return this.throttleGate;
  }

  /** Re-reads the deadline on each pass, so a later 429 extends the wait. */
  private async sleepUntilThrottleLifts(): Promise<void> {
    for (
      let remaining = this.throttledUntil - Date.now();
      remaining > 0;
      remaining = this.throttledUntil - Date.now()
    ) {
      await delay(remaining);
    }
  }

  private async requestJson(url: string, label: string): Promise<ScryfallCard> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      // No status to read here — see `classifyError`. This is the bucket an edge
      // block lands in, so it must stay distinct from a 404.
      throw new CardApiError(
        `[${this.config.name}] ${label}: request never completed (${String(err)})`,
        classifyError(err),
      );
    }

    if (!response.ok) {
      const reason = reasonForStatus(response.status);
      throw new CardApiError(
        reason === 'not_found'
          ? `${label} not found`
          : `[${this.config.name}] ${response.status} ${response.statusText} for ${url}`,
        reason,
        response.status,
        reason === 'rate_limited'
          ? parseRetryAfter(response.headers.get('Retry-After'))
          : undefined,
      );
    }
    return (await response.json()) as ScryfallCard;
  }
}
