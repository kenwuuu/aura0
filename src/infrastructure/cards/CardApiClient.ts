import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { DeckLineItem } from '@/features/deck-manager/DeckListParser';
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

  constructor(message: string, reason: LookupFailureReason, status?: number) {
    super(message);
    this.name = 'CardApiError';
    this.reason = reason;
    this.status = status;
  }
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

export type CardApiClientConfig = {
  name: string;
  baseUrl: string;
  rateLimit: {
    interval: number;
    intervalCap: number;
    timeout?: number;
  };
  endpoints: CardApiEndpoints;
};

export type FetchListResult = {
  results: CardDataResult[];
  failedItems: DeckLineItem[];
  /** Parallel to `failedItems`, but carries why each one failed. */
  failures: LookupFailure[];
};

/**
 * Generic HTTP client for any card data API that returns Scryfall-shaped JSON.
 * Endpoint URL construction, rate limit, and base URL are injected via config —
 * this class owns only the rate-limiting, retry, and per-list iteration plumbing.
 */
export class CardApiClient {
  private readonly queue: PQueue;
  private readonly config: CardApiClientConfig;

  constructor(config: CardApiClientConfig) {
    this.config = config;
    this.queue = new PQueue({
      interval: config.rateLimit.interval,
      intervalCap: config.rateLimit.intervalCap,
      timeout: config.rateLimit.timeout ?? 30000,
    });
  }

  fetchById(scryfallId: string, retries = 3): Promise<ScryfallCard> {
    const url = this.config.endpoints.byId(scryfallId);
    return this.fetchWithRetry(url, retries, `ID "${scryfallId}"`);
  }

  fetchByName(name: string, retries = 3): Promise<ScryfallCard> {
    return this.queue.add(() =>
      pRetry(
        async (attemptNumber) => {
          const url = this.config.endpoints.byName(name, attemptNumber);
          return this.requestJson(url, `Card "${name}"`);
        },
        {
          retries,
          onFailedAttempt: (error) => {
            console.error(
              `[${this.config.name}] byName attempt ${error.attemptNumber} failed for "${name}". ${error.retriesLeft} retries left.`,
            );
          },
        },
      ),
    ) as Promise<ScryfallCard>;
  }

  fetchBySet(
    setCode: string,
    collectorNumber: string,
    retries = 3,
    nameForLogging?: string,
  ): Promise<ScryfallCard> {
    const url = this.config.endpoints.bySet(setCode, collectorNumber);
    return this.fetchWithRetry(
      url,
      retries,
      `Card "${nameForLogging ?? `${setCode}/${collectorNumber}`}"`,
    );
  }

  /**
   * Iterate a deck list, preferring bySet when set+collector are present,
   * falling back to byName within this same client when bySet fails.
   * Items that fail both lookups are returned in `failedItems` for upstream
   * fallback to a different client.
   */
  async fetchImagesForList(
    entries: DeckLineItem[],
    onProgress?: (current: number, total: number) => void,
    retries = 1,
  ): Promise<FetchListResult> {
    const results: CardDataResult[] = [];
    const failedItems: DeckLineItem[] = [];
    const failures: LookupFailure[] = [];
    let completed = 0;

    for (const entry of entries) {
      const outcome = await this.lookupEntry(entry, retries);

      if (outcome.card) {
        results.push(toCardDataResult(outcome.card, entry.count, entry.commander));
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
          error: `[${this.config.name}] lookup failed for "${entry.name}" (${outcome.reason})`,
        });
      }

      completed++;
      onProgress?.(completed, entries.length);
    }

    return { results, failedItems, failures };
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
   */
  private async lookupEntry(
    entry: DeckLineItem,
    retries: number,
  ): Promise<{ card?: ScryfallCard; reason: LookupFailureReason; status?: number }> {
    if (entry.setCode && entry.collectorNumber) {
      try {
        const card = await this.fetchBySet(
          entry.setCode,
          entry.collectorNumber,
          retries,
          entry.name,
        );
        return { card, reason: 'unknown' };
      } catch (err) {
        // bySet failed — try name within this same client before giving up
        try {
          const card = await this.fetchByName(entry.name, retries);
          return { card, reason: 'unknown' };
        } catch (fallbackErr) {
          console.error(
            `[${this.config.name}] both set and name lookups failed for "${entry.name}"`,
            { primary: err, fallback: fallbackErr },
          );
          return {
            reason: classifyError(fallbackErr),
            status: statusOf(fallbackErr),
          };
        }
      }
    }

    try {
      const card = await this.fetchByName(entry.name, retries);
      return { card, reason: 'unknown' };
    } catch (err) {
      console.error(
        `[${this.config.name}] name lookup failed for "${entry.name}"`,
        err,
      );
      return { reason: classifyError(err), status: statusOf(err) };
    }
  }

  private fetchWithRetry(
    url: string,
    retries: number,
    label: string,
  ): Promise<ScryfallCard> {
    return this.queue.add(() =>
      pRetry(() => this.requestJson(url, label), {
        retries,
        onFailedAttempt: (error) => {
          console.warn(
            `[${this.config.name}] attempt ${error.attemptNumber} failed for ${label}. ${error.retriesLeft} retries left.`,
          );
        },
      }),
    ) as Promise<ScryfallCard>;
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
      );
    }
    return (await response.json()) as ScryfallCard;
  }
}
