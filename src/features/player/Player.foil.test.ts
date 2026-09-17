import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import { Card, PileType } from './types';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import { makeCards } from '@/test/factories';
import { FOIL_STYLE_NEBULA } from '@/features/cosmetics';

/**
 * The retroactive sweep: fulfillment is manual, so a code arrives hours after
 * the purchase and long after the deck was imported. Redeeming has to reach
 * cards that are already in play, or the buyer sees nothing until they rebuild
 * their board.
 */

const foilCard = (id: string): Card => ({
  ...makeCards(1)[0],
  id,
  isFoil: true,
});

const plainCard = (id: string): Card => ({ ...makeCards(1)[0], id });

/** Every pile a player owns — the sweep must reach all of them. */
const ALL_PILES: PileType[] = ['deck', 'hand', 'discard', 'exile', 'scry', 'sideboard'];

describe('Player.applyFoilEntitlement()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    player = new Player('player-1', yDoc, [], { initialHealth: 40 });
  });

  const boardCards = () => [...yDoc.getMap<Card>(YDOC_CARDS_ON_BOARD).values()];

  it('foils an owned board card that came from the list as foil', () => {
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { ...foilCard('c1'), ownerId: 'player-1' });

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(boardCards()[0].foil).toBe(FOIL_STYLE_NEBULA);
  });

  it('leaves a non-foil board card alone', () => {
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { ...plainCard('c1'), ownerId: 'player-1' });

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(boardCards()[0].foil).toBeUndefined();
  });

  it('never touches another player’s board card, foil or not', () => {
    // Ownership gates nothing else about a board card, so this filter is the
    // only thing standing between a redemption and foiling an opponent's deck.
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('theirs', { ...foilCard('theirs'), ownerId: 'player-2' });

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(boardCards()[0].foil).toBeUndefined();
  });

  it.each(ALL_PILES)('foils the cards already sitting in the %s pile', (pileType) => {
    // Wider than reset's sweep, which skips sideboard and scry on purpose. That
    // is right for a reset and wrong here: a foil card waiting in the sideboard
    // is still owned, and still expected to shimmer the moment it is drawn.
    player.getPile(pileType).setCards([foilCard('a'), plainCard('b'), foilCard('c')]);

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(player.getPile(pileType).getCards().map((c) => c.foil)).toEqual([
      FOIL_STYLE_NEBULA,
      undefined,
      FOIL_STYLE_NEBULA,
    ]);
  });

  it('leaves a peer’s piles untouched', () => {
    const peer = new Player('player-2', yDoc, [], { initialHealth: 40 });
    peer.getPile('hand').setCards([foilCard('theirs')]);

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(peer.getPile('hand').getCards()[0].foil).toBeUndefined();
  });

  it('reaches every zone in a single update, not one per card', () => {
    // Peers replay whatever this emits. A sweep over a 100-card deck that was
    // not batched would put 100 updates on the wire for one click.
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { ...foilCard('c1'), ownerId: 'player-1' });
    player.getPile('deck').setCards(makeCards(40).map((c) => ({ ...c, isFoil: true })));

    let updates = 0;
    yDoc.on('update', () => { updates += 1; });

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(updates).toBe(1);
  });

  it('is safe to run twice', () => {
    // The player may redeem a second code, or re-enter the same one.
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { ...foilCard('c1'), ownerId: 'player-1' });
    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    let updates = 0;
    yDoc.on('update', () => { updates += 1; });
    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(boardCards()[0].foil).toBe(FOIL_STYLE_NEBULA);
    expect(updates).toBe(0);
  });

  it('keeps the import flag, so a later style can still be applied', () => {
    yDoc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { ...foilCard('c1'), ownerId: 'player-1' });

    player.applyFoilEntitlement(FOIL_STYLE_NEBULA);

    expect(boardCards()[0].isFoil).toBe(true);
  });
});
