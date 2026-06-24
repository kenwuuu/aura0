import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { DeckLineItem } from '@/services/deckImporter/DeckListParser';
import { toCardDataResult } from './ScryfallCardAdapter';
import { CardDataResult, ScryfallCard } from './types';

export type CardApiEndpoints = {
  byId: (id: string) => string;
  byName: (name: string, attemptNumber: number) => string;
  bySet: (setCode: string, collectorNumber: string) => string;
};

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
    let completed = 0;

    for (const entry of entries) {
      const card = await this.lookupEntry(entry, retries);

      if (card) {
        results.push(toCardDataResult(card, entry.count));
      } else {
        failedItems.push(entry);
        results.push({
          count: entry.count,
          name: entry.name,
          type_line: undefined,
          scryfallId: '',
          imageUris: { front: null, back: null },
          error: `[${this.config.name}] lookup failed for "${entry.name}"`,
        });
      }

      completed++;
      onProgress?.(completed, entries.length);
    }

    return { results, failedItems };
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPendingCount(): number {
    return this.queue.pending;
  }

  private async lookupEntry(
    entry: DeckLineItem,
    retries: number,
  ): Promise<ScryfallCard | undefined> {
    if (entry.setCode && entry.collectorNumber) {
      try {
        return await this.fetchBySet(
          entry.setCode,
          entry.collectorNumber,
          retries,
          entry.name,
        );
      } catch (err) {
        // bySet failed — try name within this same client before giving up
        try {
          return await this.fetchByName(entry.name, retries);
        } catch (fallbackErr) {
          console.error(
            `[${this.config.name}] both set and name lookups failed for "${entry.name}"`,
            { primary: err, fallback: fallbackErr },
          );
          return undefined;
        }
      }
    }

    try {
      return await this.fetchByName(entry.name, retries);
    } catch (err) {
      console.error(
        `[${this.config.name}] name lookup failed for "${entry.name}"`,
        err,
      );
      return undefined;
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
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`${label} not found`);
      }
      throw new Error(
        `[${this.config.name}] ${response.status} ${response.statusText} for ${url}`,
      );
    }
    return (await response.json()) as ScryfallCard;
  }
}
