/**
 * Canonical `CardLookupService` stub — the network boundary, which is one of the
 * few things this repo's tests are allowed to fake (`tests/testing-react.md`).
 *
 * It resolves every name it is asked for by echoing it back with synthetic art,
 * so a test that cares about *where cards end up* never has to describe card
 * data. Tests that care about resolution failure pass `unresolvable`.
 */
import { vi } from 'vitest';
import type { CardLookupService } from '@/infrastructure/cards';
import type { CardDataResult, ScryfallCard } from '@/infrastructure/cards/types';
import type { DeckLineItem } from '@/features/deck-manager/DeckListParser';

export interface FakeCardLookupOptions {
  /** Names (case-insensitive) the lookup should fail to resolve. */
  unresolvable?: string[];
  /** Scryfall ids `fetchCardById` should reject for, simulating a dead token. */
  unresolvableIds?: string[];
}

export interface FakeCardLookup {
  service: CardLookupService;
  /** Every entry list passed to `fetchImagesForList`, in call order. */
  listCalls: DeckLineItem[][];
  /** Every scryfall id passed to `fetchCardById`, in call order. */
  byIdCalls: string[];
}

function syntheticCard(name: string, scryfallId: string): CardDataResult {
  return {
    count: 1,
    name,
    type_line: 'Creature — Test Subject',
    oracleText: `${name} does something.`,
    scryfallId,
    imageUris: { front: { normal: `https://img/${scryfallId}.png` }, back: null },
  };
}

/**
 * The scryfall id this fake resolves a name to — deterministic, so a test can
 * assert what got hydrated, and so a fixture card can be built already carrying
 * the id its name would resolve to (which is what a real card looks like).
 */
export const fakeScryfallId = (name: string) =>
  `sf-${name.trim().toLowerCase().replace(/\s+/g, '-')}`;

const idForName = fakeScryfallId;

export function createFakeCardLookup(options: FakeCardLookupOptions = {}): FakeCardLookup {
  const unresolvable = new Set((options.unresolvable ?? []).map((n) => n.toLowerCase()));
  const unresolvableIds = new Set(options.unresolvableIds ?? []);

  const listCalls: DeckLineItem[][] = [];
  const byIdCalls: string[] = [];

  const service = {
    fetchImagesForList: vi.fn(
      async (entries: DeckLineItem[], onProgress?: (c: number, t: number) => void) => {
        listCalls.push(entries);

        const results: CardDataResult[] = [];
        const failedItems: DeckLineItem[] = [];

        entries.forEach((entry, i) => {
          if (unresolvable.has(entry.name.toLowerCase())) {
            failedItems.push(entry);
          } else {
            results.push(syntheticCard(entry.name, idForName(entry.name)));
          }
          onProgress?.(i + 1, entries.length);
        });

        return {
          results,
          failedItems,
          failures: failedItems.map((item) => ({ item, reason: 'not_found' as const })),
          printingMismatches: [],
          fallbackTriggeredCount: 0,
          fallbackRecoveredCount: 0,
          fallbackFailedCount: failedItems.length,
          auraFailures: [],
        };
      },
    ),

    fetchCardById: vi.fn(async (scryfallId: string): Promise<ScryfallCard> => {
      byIdCalls.push(scryfallId);
      if (unresolvableIds.has(scryfallId)) throw new Error(`No such card: ${scryfallId}`);
      return {
        id: scryfallId,
        name: `Token ${scryfallId}`,
        type_line: 'Token Creature',
        image_uris: { normal: `https://img/${scryfallId}.png` },
      };
    }),

    createCardDataResult: vi.fn((card: ScryfallCard): CardDataResult => ({
      count: 1,
      name: card.name,
      type_line: card.type_line,
      oracleText: card.oracle_text,
      scryfallId: card.id,
      imageUris: { front: card.image_uris ?? null, back: null },
    })),

    fetchCardByName: vi.fn(),
    extractTokenIds: vi.fn(() => []),
  } as unknown as CardLookupService;

  return { service, listCalls, byIdCalls };
}
