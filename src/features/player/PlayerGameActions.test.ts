/**
 * Unit tests for the new game-action Player methods:
 * drawCards, mill, exileTopOfDeck, randomDiscard, exileAllDiscard.
 *
 * Uses a real Y.Doc (per testing convention in CLAUDE.md).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import { Deck } from './Deck';
import { getActionLog } from '@/features/action-log/actionLog';

function makePlayer(cardCount = 10) {
  const yDoc = new Y.Doc();
  const playerId = 'test-player';
  const deck = new Deck(undefined, cardCount);
  const player = new Player(playerId, yDoc, deck, { initialHealth: 40 });
  return { yDoc, player, playerId };
}

// ── drawCards ────────────────────────────────────────────────────────────────

describe('Player.drawCards()', () => {
  it('draws N cards into hand and logs once', () => {
    const { yDoc, player } = makePlayer(10);
    player.drawCards(3);
    expect(player.getState().hand).toHaveLength(3);
    expect(player.getDeck().getCardCount()).toBe(7);
    const log = getActionLog(yDoc).toArray();
    const entry = log.find((e) => e.type === 'draw' && e.text.includes('3'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('3 cards');
  });

  it('does not exceed deck size', () => {
    const { player } = makePlayer(3);
    player.drawCards(10);
    // Should have drawn exactly 3 (what's available)
    expect(player.getState().hand.length).toBeLessThanOrEqual(3);
    expect(player.getDeck().getCardCount()).toBe(0);
  });

  it('singular "card" when drawing 1', () => {
    const { yDoc, player } = makePlayer(5);
    player.drawCards(1);
    const log = getActionLog(yDoc).toArray();
    const entry = log.find((e) => e.type === 'draw');
    expect(entry!.text).toContain('1 card');
    expect(entry!.text).not.toContain('1 cards');
  });
});

// ── mill ─────────────────────────────────────────────────────────────────────

describe('Player.mill()', () => {
  it('moves top N cards from deck to discard', () => {
    const { yDoc, player } = makePlayer(10);
    player.mill(3);
    expect(player.getState().discardPile).toHaveLength(3);
    expect(player.getDeck().getCardCount()).toBe(7);
    const log = getActionLog(yDoc).toArray();
    const entry = log.find((e) => e.type === 'mill');
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('3');
  });

  it('mills at most deck size', () => {
    const { player } = makePlayer(2);
    player.mill(10);
    expect(player.getState().discardPile).toHaveLength(2);
    expect(player.getDeck().getCardCount()).toBe(0);
  });

  it('does not log when deck is empty', () => {
    const { yDoc, player } = makePlayer(0);
    player.mill(3);
    const log = getActionLog(yDoc).toArray();
    expect(log.filter((e) => e.type === 'mill')).toHaveLength(0);
  });
});

// ── exileTopOfDeck ────────────────────────────────────────────────────────────

describe('Player.exileTopOfDeck()', () => {
  it('moves the top deck card to exile and logs', () => {
    const { yDoc, player } = makePlayer(5);
    const topBefore = player.getDeck().peekTop();
    player.exileTopOfDeck();
    expect(player.getState().exilePile).toHaveLength(1);
    expect(player.getDeck().getCardCount()).toBe(4);
    // The exiled card should be the one that was on top
    expect(player.getState().exilePile[0].id).toBe(topBefore!.id);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('exiled'))).toBe(true);
  });

  it('does nothing on empty deck', () => {
    const { player } = makePlayer(0);
    player.exileTopOfDeck();
    expect(player.getState().exilePile).toHaveLength(0);
  });
});

// ── randomDiscard ─────────────────────────────────────────────────────────────

describe('Player.randomDiscard()', () => {
  it('moves exactly one random hand card to discard', () => {
    const { yDoc, player } = makePlayer(5);
    player.drawCards(3);
    player.randomDiscard();
    expect(player.getState().hand).toHaveLength(2);
    expect(player.getState().discardPile).toHaveLength(1);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'random_discard')).toBe(true);
  });

  it('does nothing on empty hand', () => {
    const { player } = makePlayer(5);
    // Do not draw — hand is empty.
    player.randomDiscard();
    expect(player.getState().discardPile).toHaveLength(0);
  });
});

// ── exileAllDiscard ───────────────────────────────────────────────────────────

describe('Player.exileAllDiscard()', () => {
  it('moves all discard cards to exile and clears discard', () => {
    const { yDoc, player } = makePlayer(5);
    player.drawCards(3);
    // Manually send hand to discard
    player.getState().hand.forEach((card) => {
      player.movePileCard(card, 'hand', 'discard');
    });
    expect(player.getState().discardPile).toHaveLength(3);

    player.exileAllDiscard();
    expect(player.getState().discardPile).toHaveLength(0);
    expect(player.getState().exilePile).toHaveLength(3);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('exiled all'))).toBe(true);
  });

  it('does nothing on empty discard', () => {
    const { yDoc, player } = makePlayer(5);
    player.exileAllDiscard();
    expect(player.getState().exilePile).toHaveLength(0);
    // No log entry for empty discard
    const log = getActionLog(yDoc).toArray();
    expect(log.filter((e) => e.text.includes('exiled all'))).toHaveLength(0);
  });
});
