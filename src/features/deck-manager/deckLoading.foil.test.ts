import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { loadDeck } from './deckLoading';
import { Player } from '@/features/player';
import { Card, SavedDeck } from '@/features/player/types';
import { makeCards } from '@/test/factories';
import { FOIL_STYLE_NEBULA, useCosmeticsStore } from '@/features/cosmetics';
import type { RoomManager } from '@/features/room';

/**
 * Stamping on load is the other half of the retroactive sweep: the sweep covers
 * cards already in play, this covers every deck loaded afterwards.
 */

const roomManager = { getRoomName: () => 'test-room' } as RoomManager;

const deck = (cards: Card[]): SavedDeck =>
  ({
    metadata: { id: 'd1', name: 'Test', format: 'commander' },
    cards,
  }) as SavedDeck;

/** Ten foil cards — enough that an opening-hand deal leaves some in the deck. */
const foils = (): Card[] => makeCards(10).map((card) => ({ ...card, isFoil: true }));

describe('loadDeck — foil stamping', () => {
  let player: Player;

  beforeEach(() => {
    player = new Player('p1', new Y.Doc(), [], { initialHealth: 40 });
    useCosmeticsStore.setState({ entitlements: {} });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Every card the player ends up holding. Loading a deck also deals an opening
   * hand, so the cards are split across two piles and reading only the deck
   * would miss the seven that matter most — the ones on screen first.
   */
  const loadedCards = async (savedDeck: SavedDeck): Promise<Card[]> => {
    loadDeck(player, roomManager, savedDeck);
    // loadNewDeck is async; let its promise chain settle before reading.
    await vi.waitFor(() => expect(player.getHand().getCardCount()).toBeGreaterThan(0));
    return [...player.getDeck().getCards(), ...player.getHand().getCards()];
  };

  it('stamps every foil card when the player is entitled', async () => {
    useCosmeticsStore.setState({ entitlements: { [FOIL_STYLE_NEBULA]: true } });

    const cards = await loadedCards(deck(foils()));

    expect(cards).toHaveLength(10);
    expect(cards.every((card) => card.foil === FOIL_STYLE_NEBULA)).toBe(true);
  });

  it('leaves foil cards unstamped when the player is not entitled', async () => {
    const cards = await loadedCards(deck(foils()));

    expect(cards.some((card) => card.foil !== undefined)).toBe(false);
  });

  it('keeps the import flag on an unstamped card, so a later purchase can find it', async () => {
    // This is what makes the retroactive sweep possible at all. Drop `isFoil`
    // here and a player who buys tomorrow has nothing left to light up.
    const cards = await loadedCards(deck(foils()));

    expect(cards.every((card) => card.isFoil === true)).toBe(true);
  });

  it('never stamps a card the list did not mark foil', async () => {
    useCosmeticsStore.setState({ entitlements: { [FOIL_STYLE_NEBULA]: true } });

    const cards = await loadedCards(deck(makeCards(10)));

    expect(cards.some((card) => card.foil !== undefined)).toBe(false);
  });
});
