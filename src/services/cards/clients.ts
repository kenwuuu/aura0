import { CardApiClient, CardApiClientConfig } from './CardApiClient';

const AURA_BASE_URL = 'https://digitalocean-ws-ipv4.aura0.app/v1';
// const AURA_BASE_URL = 'http://localhost:8000/v1';  # uncomment for local testing

const SCRYFALL_BASE_URL = 'https://api.scryfall.com';

const AURA_CONFIG: CardApiClientConfig = {
  name: 'aura',
  baseUrl: AURA_BASE_URL,
  rateLimit: { interval: 1000, intervalCap: 200 },
  endpoints: {
    byId: (id) => `${AURA_BASE_URL}/cards/${id}`,
    // Aura backend has a single endpoint that handles both exact and fuzzy
    // matching server-side — no client-side exact/fuzzy split.
    byName: (name) => `${AURA_BASE_URL}/cards/${encodeURIComponent(name)}`,
    bySet: (setCode, collectorNumber) =>
      `${AURA_BASE_URL}/cards/${encodeURIComponent(setCode)}${encodeURIComponent(collectorNumber)}`,
  },
};

const SCRYFALL_CONFIG: CardApiClientConfig = {
  name: 'scryfall',
  baseUrl: SCRYFALL_BASE_URL,
  // Scryfall's published rate limit is 10 req/s; we stay well under it.
  rateLimit: { interval: 1000, intervalCap: 2 },
  endpoints: {
    byId: (id) => `${SCRYFALL_BASE_URL}/cards/${id}`,
    // Exact match on first attempt; fall back to fuzzy on retries.
    byName: (name, attemptNumber) => {
      const param = attemptNumber >= 2 ? 'fuzzy' : 'exact';
      return `${SCRYFALL_BASE_URL}/cards/named?${param}=${encodeURIComponent(name)}`;
    },
    bySet: (setCode, collectorNumber) =>
      `${SCRYFALL_BASE_URL}/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(collectorNumber)}/en`,
  },
};

export const createAuraClient = (): CardApiClient => new CardApiClient(AURA_CONFIG);

export const createScryfallClient = (): CardApiClient => new CardApiClient(SCRYFALL_CONFIG);
