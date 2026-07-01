/**
 * Game Actions Registry
 *
 * MTG-specific list of player actions exposed in the top toolbar.
 * Each GameAction is a declarative descriptor; the toolbar/menu components
 * are generic and only consume this list through the GameAction interface.
 *
 * To add a new action: add a new entry here. No component changes needed.
 * To move to a generic engine: this file moves with the MTG logic.
 */

import { GameAction, GameActionContext } from './gameActionTypes';
import { executeBattlefieldCardAction } from '@/features/battlefield/battlefieldCardActions';
import { useScryStore } from '@/features/game-dock/scryStore';
import { useSurveilStore } from '@/features/game-dock/surveilStore';
import { useNumberPromptStore } from './numberPromptStore';
import { useTokenCardSearchStore } from './tokenCardSearchStore';
import { logAction } from '@/features/action-log/actionLog';
import { YDOC_KEYWORD_TOKENS } from '@/constants';
import * as Y from 'yjs';
import type { KeywordToken } from '@/features/keyword-tokens/types';

// ── Toolbar buttons ──────────────────────────────────────────────────────────

const untapAll: GameAction = {
  id: 'untap-all',
  label: 'Untap All',
  surface: 'toolbar',
  perform({ player, yDoc, playerId, yCards }) {
    const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
    executeBattlefieldCardAction('untapAll', '', yCards, yTokens, playerId);
  },
};

const draw: GameAction = {
  id: 'draw',
  label: 'Draw',
  surface: 'toolbar',
  perform({ player }) {
    player.drawCard();
  },
};

const pass: GameAction = {
  id: 'pass',
  label: 'Pass',
  surface: 'toolbar',
  perform({ player, yDoc, playerId }) {
    logAction(yDoc, {
      actorId: playerId,
      type: 'pass_turn',
      text: 'passed their turn',
      // Soft amber: stands out but is not glaring
      tone: 'rgba(250,200,80,0.95)',
    });
  },
};

// ── Actions dropdown ─────────────────────────────────────────────────────────

const drawX: GameAction = {
  id: 'draw-x',
  label: 'Draw X',
  surface: 'actions',
  perform({ player }) {
    const max = player.getDeck().getCardCount();
    useNumberPromptStore.getState().open({
      title: 'Draw Cards',
      label: 'How many cards?',
      min: 1,
      max,
      defaultValue: 1,
      confirmLabel: 'Draw',
      onConfirm: (n) => player.drawCards(n),
    });
  },
};

const scry: GameAction = {
  id: 'scry',
  label: 'Scry',
  surface: 'actions',
  perform() {
    useScryStore.getState().request();
  },
};

const surveil: GameAction = {
  id: 'surveil',
  label: 'Surveil',
  surface: 'actions',
  perform() {
    useSurveilStore.getState().request();
  },
};

const mill: GameAction = {
  id: 'mill',
  label: 'Mill',
  surface: 'actions',
  perform({ player }) {
    const max = player.getDeck().getCardCount();
    useNumberPromptStore.getState().open({
      title: 'Mill',
      label: 'How many cards?',
      min: 1,
      max,
      defaultValue: 1,
      confirmLabel: 'Mill',
      onConfirm: (n) => player.mill(n),
    });
  },
};

const exileTop: GameAction = {
  id: 'exile-top',
  label: 'Exile Top',
  surface: 'actions',
  perform({ player }) {
    player.exileTopOfDeck();
  },
};

const lookAtTop: GameAction = {
  id: 'look-at-top',
  label: 'Look at Top',
  surface: 'actions',
  perform({ player }) {
    // Opens the deck viewer — the player can see all cards.
    // Use the same pile-viewer-open store pattern as PileNode.
    import('@/features/game-dock/pileViewerOpenStore').then(({ usePileViewerOpenStore }) => {
      usePileViewerOpenStore.getState().open({ scope: 'local', pile: 'deck' });
    });
  },
};

const randomDiscard: GameAction = {
  id: 'random-discard',
  label: 'Random Discard',
  surface: 'actions',
  perform({ player }) {
    player.randomDiscard();
  },
};

const revealHand: GameAction = {
  id: 'reveal-hand',
  label: 'Reveal Hand',
  surface: 'actions',
  perform({ player, yDoc, playerId }) {
    const isRevealing = !player.getAllowViewHand();
    player.setAllowViewHand(isRevealing);
    logAction(yDoc, {
      actorId: playerId,
      type: 'reveal',
      text: isRevealing ? 'revealed their hand' : 'stopped revealing their hand',
    });
  },
};

const shuffle: GameAction = {
  id: 'shuffle',
  label: 'Shuffle',
  surface: 'actions',
  perform({ player }) {
    player.shuffleDeck();
  },
};

const mulligan: GameAction = {
  id: 'mulligan',
  label: 'Mulligan',
  surface: 'actions',
  perform({ player }) {
    player.mulligan();
  },
};

// ── Create dropdown ──────────────────────────────────────────────────────────

const createToken: GameAction = {
  id: 'create-token',
  label: 'Token',
  surface: 'create',
  // Handled inline in GameActionsToolbar via a sub-popover for the grid.
  // perform is a no-op; the toolbar renders a special sub-menu for this item.
  perform() {},
};

const createTokenCard: GameAction = {
  id: 'create-token-card',
  label: 'Token Card',
  surface: 'create',
  perform() {
    useTokenCardSearchStore.getState().open();
  },
};

const createLabel: GameAction = {
  id: 'create-label',
  label: 'Label',
  surface: 'create',
  disabled: true,
  disabledReason: 'Coming soon',
  perform() {},
};

// ── Exported registry ────────────────────────────────────────────────────────

export const GAME_ACTIONS: GameAction[] = [
  // Toolbar
  untapAll,
  draw,
  pass,
  // Actions menu
  drawX,
  scry,
  surveil,
  mill,
  exileTop,
  lookAtTop,
  randomDiscard,
  revealHand,
  shuffle,
  mulligan,
  // Create menu
  createToken,
  createTokenCard,
  createLabel,
];
