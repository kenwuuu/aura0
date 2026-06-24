# Card data lookup

`CardLookupService` is the single entry point for fetching card data; 
deck import, ad-hoc "add card" lookups, and `TokenService` all go through it. 
It composes two `CardApiClient` instances built by `createAuraClient()` / `createScryfallClient()` 
factories in `clients.ts` — Aura is our own backend (high rate limit), 
Scryfall is the public API (2 req/s). Policy: `fetchImagesForList` and `fetchCardByName` try 
Aura first and fall back to Scryfall for any items it can't resolve; `fetchCardById` skips Aura 
and goes straight to Scryfall because Scryfall IDs are canonical to Scryfall. `CardApiClient` is 
generic — endpoint URL shapes, rate limit, and the optional exact→fuzzy name retry are config, 
not code. The Aura base URL is hardcoded to production with a commented `localhost:8000/v1` 
sentinel in `clients.ts`; uncomment to test against a local backend. To add a third backend, 
write a new `createFooClient()` and inject it into `CardLookupService`'s constructor.
