import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import { Card, SavedDeck } from './types';
import { getActionLog } from '@/features/action-log/actionLog';
import { makeCard, makeCards } from '@/test/factories';

/**
 * The sideboard is a private zone: its contents belong to its owner alone, and
 * the two ways that privacy can leak are the shared action log and the deck
 * itself (a sideboard swept into the deck is both a leak and an illegal deck).
 */
describe('Player sideboard', () => {
  let yDoc: Y.Doc;
  let player: Player;

  const savedDeck = (cards: Card[], sideboard?: Card[]): SavedDeck => ({
    metadata: {
      id: 'd1',
      name: 'Test',
      source: 'scryfall',
      cardCount: cards.length,
      importedAt: new Date(),
      lastModified: new Date(),
    },
    cards,
    ...(sideboard ? { sideboard } : {}),
  });

  beforeEach(() => {
    yDoc = new Y.Doc();
    player = new Player('p1', yDoc, makeCards(10), { initialHealth: 40 });
  });

  // Just the pile moves — the log also opens with the player's 'joined the game'.
  const moveLog = () =>
    getActionLog(yDoc).toArray().filter((e) => e.type === 'move_to_pile').map((e) => e.text);

  describe('loading a deck', () => {
    it('loads the sideboard into its own pile, not into the deck', async () => {
      const deck = makeCards(60);
      const sideboard = makeCards(15);

      await player.loadNewDeck(savedDeck(deck, sideboard));

      expect(player.getSideboardCards()).toHaveLength(15);
      // The whole point: a 60-card deck with a 15-card sideboard is a 60-card
      // deck. Merging the two would be an illegal deck and a shuffled-in leak.
      // Counted across deck + hand, because loading deals an opening hand.
      const inDeck = player.getDeckCards().length + player.getState().hand.length;
      expect(inDeck).toBe(60);
    });

    it('clears a previous deck’s sideboard when the new deck has none', async () => {
      await player.loadNewDeck(savedDeck(makeCards(60), makeCards(15)));
      expect(player.getSideboardCards()).toHaveLength(15);

      // A deck saved before sideboards existed carries no `sideboard`. That is
      // an empty sideboard — not "keep whatever was there", which would leave
      // the last deck's cards sitting in this one's sideboard.
      await player.loadNewDeck(savedDeck(makeCards(60)));

      expect(player.getSideboardCards()).toEqual([]);
    });
  });

  describe('reset', () => {
    it('leaves the sideboard alone rather than sweeping it into the deck', async () => {
      await player.loadNewDeck(savedDeck(makeCards(60), makeCards(15)));

      player.reset();

      expect(player.getSideboardCards()).toHaveLength(15);
      // Sweeping the sideboard in would hand the player a 75-card deck.
      expect(player.getDeckCards()).toHaveLength(60);
    });
  });

  describe('the action log', () => {
    it('does not name a card moved from the sideboard to hand', () => {
      // A wish or a companion. Opponents may see that something came off the
      // sideboard; naming it would tell them exactly what is in there.
      const card = makeCard({ name: 'Lurrus of the Dream-Den' });
      player.placeCardInPile(card, 'sideboard');

      player.movePileCard(card, 'sideboard', 'hand');

      expect(moveLog()).toEqual(['moved a card to hand']);
      expect(moveLog().join()).not.toContain('Lurrus');
    });

    it('does not name a card moved from the deck into the sideboard', () => {
      // Sideboarding between games. Which card you took out is yours to know.
      const card = makeCard({ name: 'Blood Moon' });
      player.placeCardInPile(card, 'deck');

      player.movePileCard(card, 'deck', 'sideboard');

      expect(moveLog()).toEqual(['moved a card to sideboard']);
      expect(moveLog().join()).not.toContain('Blood Moon');
    });

    it('still names a card the move itself puts in plain sight', () => {
      // Discard is a public zone — opponents can open it and read the card. A
      // vague log line here would buy no privacy and only make the log lie about
      // a card everyone can already see.
      const card = makeCard({ name: 'Pyroblast' });
      player.placeCardInPile(card, 'sideboard');

      player.movePileCard(card, 'sideboard', 'discard');

      expect(moveLog()).toEqual(['moved Pyroblast to discard']);
    });

    it('keeps naming cards on moves that never touch the sideboard', () => {
      const card = makeCard({ name: 'Lightning Bolt' });
      player.placeCardInPile(card, 'hand');

      player.movePileCard(card, 'hand', 'discard');

      expect(moveLog()).toEqual(['moved Lightning Bolt to discard']);
    });
  });
});
