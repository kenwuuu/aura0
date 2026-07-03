import { describe, it, expect, vi } from 'vitest';
import { GAME_ACTIONS } from './gameActions';
import type { GameActionContext } from './gameActionTypes';
import { getActionLog } from '@/features/action-log/actionLog';
import { seedGame } from '@/test/seedGame';
import { useScryStore } from '@/features/game-dock/scryStore';
import { useSurveilStore } from '@/features/game-dock/surveilStore';
import { useNumberPromptStore } from './numberPromptStore';
import { useTokenCardSearchStore } from './tokenCardSearchStore';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';

function getAction(id: string) {
  const action = GAME_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`No GAME_ACTIONS entry with id "${id}"`);
  return action;
}

function makeContext(overrides: Partial<{ hand: any[]; deck: any[] }> = {}): GameActionContext {
  const { yDoc, player, playerId } = seedGame({
    playerId: 'p1',
    hand: overrides.hand,
    deck: overrides.deck,
  });
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  return { player, yDoc, playerId, yCards, yTokens };
}

describe('GAME_ACTIONS registry', () => {
  it('has a unique id for every action', () => {
    const ids = GAME_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every action a known surface', () => {
    GAME_ACTIONS.forEach((action) => {
      expect(['toolbar', 'actions', 'create']).toContain(action.surface);
    });
  });
});

describe('untap-all', () => {
  it('untaps the acting player\'s tapped cards on the board and logs it', () => {
    const ctx = makeContext();
    ctx.yCards.set('card-1', {
      id: 'card-1', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: true, isFlipped: false,
      counters: [], zIndex: 1, ownerId: ctx.playerId,
    });

    getAction('untap-all').perform(ctx);

    expect(ctx.yCards.get('card-1')!.isTapped).toBe(false);
    const log = getActionLog(ctx.yDoc).toArray();
    expect(log.some((e) => e.type === 'untap_all')).toBe(true);
  });
});

describe('draw', () => {
  it('draws a single card into hand', () => {
    const ctx = makeContext({ deck: [{ id: 'c1' } as any] });

    getAction('draw').perform(ctx);

    expect(ctx.player.getState().hand).toHaveLength(1);
  });
});

describe('pass', () => {
  it('logs a pass_turn entry and does not touch player state', () => {
    const ctx = makeContext();
    const healthBefore = ctx.player.getState().health;

    getAction('pass').perform(ctx);

    const log = getActionLog(ctx.yDoc).toArray();
    const entry = log.find((e) => e.type === 'pass_turn');
    expect(entry).toBeDefined();
    expect(entry!.text).toBe('passed their turn');
    expect(ctx.player.getState().health).toBe(healthBefore);
  });
});

describe('draw-x', () => {
  it('opens the number prompt scoped to the deck size, and onConfirm draws n cards', () => {
    const ctx = makeContext({ deck: [{ id: 'c1' } as any, { id: 'c2' } as any, { id: 'c3' } as any] });

    getAction('draw-x').perform(ctx);

    const request = useNumberPromptStore.getState().request;
    expect(request).not.toBeNull();
    expect(request!.max).toBe(3);

    request!.onConfirm(2);
    expect(ctx.player.getState().hand).toHaveLength(2);
  });
});

describe('mill', () => {
  it('opens the number prompt scoped to the deck size, and onConfirm mills n cards', () => {
    const ctx = makeContext({ deck: [{ id: 'c1' } as any, { id: 'c2' } as any] });

    getAction('mill').perform(ctx);

    const request = useNumberPromptStore.getState().request;
    expect(request!.max).toBe(2);

    request!.onConfirm(2);
    expect(ctx.player.getState().discardPile).toHaveLength(2);
  });
});

describe('exile-top', () => {
  it('exiles the top card of the deck', () => {
    const ctx = makeContext({ deck: [{ id: 'c1' } as any] });

    getAction('exile-top').perform(ctx);

    expect(ctx.player.getState().exilePile).toHaveLength(1);
  });
});

describe('random-discard', () => {
  it('discards a random hand card', () => {
    const ctx = makeContext({ hand: [{ id: 'c1' } as any] });

    getAction('random-discard').perform(ctx);

    expect(ctx.player.getState().hand).toHaveLength(0);
    expect(ctx.player.getState().discardPile).toHaveLength(1);
  });
});

describe('reveal-hand', () => {
  it('toggles allow-view-hand on, logging "revealed"', () => {
    const ctx = makeContext();

    getAction('reveal-hand').perform(ctx);

    expect(ctx.player.getAllowViewHand()).toBe(true);
    const log = getActionLog(ctx.yDoc).toArray();
    expect(log.some((e) => e.type === 'reveal' && e.text.includes('revealed'))).toBe(true);
  });

  it('toggles allow-view-hand off on a second call, logging "stopped revealing"', () => {
    const ctx = makeContext();
    getAction('reveal-hand').perform(ctx);

    getAction('reveal-hand').perform(ctx);

    expect(ctx.player.getAllowViewHand()).toBe(false);
    const log = getActionLog(ctx.yDoc).toArray();
    expect(log.some((e) => e.type === 'reveal' && e.text.includes('stopped revealing'))).toBe(true);
  });
});

describe('shuffle', () => {
  it('shuffles the deck without changing its size', () => {
    const ctx = makeContext({ deck: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}` } as any)) });
    const sizeBefore = ctx.player.getDeck().getCardCount();

    getAction('shuffle').perform(ctx);

    expect(ctx.player.getDeck().getCardCount()).toBe(sizeBefore);
  });
});

describe('mulligan', () => {
  it('returns the hand to the deck and draws a fresh 7', () => {
    const ctx = makeContext({ deck: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` } as any)) });

    getAction('mulligan').perform(ctx);

    expect(ctx.player.getState().hand).toHaveLength(7);
  });
});

describe('scry / surveil', () => {
  it('scry sets the scry store as requested', () => {
    const ctx = makeContext();
    getAction('scry').perform(ctx);
    expect(useScryStore.getState().requested).toBe(true);
  });

  it('surveil sets the surveil store as requested', () => {
    const ctx = makeContext();
    getAction('surveil').perform(ctx);
    expect(useSurveilStore.getState().requested).toBe(true);
  });
});

describe('look-at-top', () => {
  it('opens the deck pile viewer', async () => {
    const ctx = makeContext();

    getAction('look-at-top').perform(ctx);
    // perform() kicks off a dynamic import().then(...) — wait for it to settle.
    await vi.waitFor(() => {
      expect(usePileViewerOpenStore.getState().request).toEqual({ scope: 'local', pile: 'deck' });
    });
  });
});

describe('create-token-card', () => {
  it('opens the token card search store', () => {
    const ctx = makeContext();
    getAction('create-token-card').perform(ctx);
    expect(useTokenCardSearchStore.getState().isOpen).toBe(true);
  });
});

describe('disabled create-menu placeholders', () => {
  it('create-token and create-label are marked disabled and are safe no-ops', () => {
    const ctx = makeContext();
    const token = getAction('create-token');
    const label = getAction('create-label');

    expect(token.disabled).toBe(true);
    expect(label.disabled).toBe(true);
    expect(() => token.perform(ctx)).not.toThrow();
    expect(() => label.perform(ctx)).not.toThrow();
  });
});
