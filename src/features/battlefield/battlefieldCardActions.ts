/**
 * Battlefield card actions
 *
 * Centralized logic for executing actions on battlefield cards.
 * Used by both keyboard hotkeys and context menu clicks.
 */

import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { YDOC_KEYWORD_TOKENS } from '@/constants';
import { attachedChildren } from './nodeAttachment';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { logAction, cardLogName } from '@/features/action-log/actionLog';

/** Clear `attachedTo` on any token that was attached to the given card. */
function detachTokens(cardId: string, yTokens: Y.Map<KeywordToken>) {
  attachedChildren(cardId, yTokens).forEach((token) => {
    yTokens.set(token.id, { ...token, attachedTo: undefined });
  });
}

export function executeBattlefieldCardAction(
  action: string,
  cardId: string,
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  playerId: string,
) {
  const yDoc = yCards.doc;

  if (action === 'untapAll') {
    yCards.forEach((c, cId) => {
      if (c.ownerId === playerId && c.isTapped) {
        yCards.set(cId, { ...c, isTapped: false });
      }
    });
    if (yDoc) {
      logAction(yDoc, { actorId: playerId, type: 'untap_all', text: 'untapped all cards' });
    }
    return;
  }

  const card = yCards.get(cardId);
  if (!card) return;

  switch (action) {
    case 'tap':
      yCards.set(cardId, { ...card, isTapped: !card.isTapped });
      if (yDoc) {
        logAction(yDoc, {
          actorId: playerId,
          type: 'tap',
          // card.isTapped reflects the state *before* the toggle
          text: card.isTapped ? `untapped ${cardLogName(card)}` : `tapped ${cardLogName(card)}`,
        });
      }
      break;
    case 'flip': {
      // card.isFlipped reflects the state *before* the toggle.
      const willBeFlipped = !card.isFlipped;
      yCards.set(cardId, { ...card, isFlipped: willBeFlipped });
      if (yDoc) {
        logAction(yDoc, {
          actorId: playerId,
          type: 'flip',
          // Flipping face down must not name the card it's hiding; flipping
          // face up reveals it to everyone at once, so the name is now public.
          text: willBeFlipped ? 'flipped a card face down' : `flipped ${card.name} face up`,
        });
      }
      break;
    }
    case 'copy': {
      let maxZIndex = 0;
      yCards.forEach((c) => { if (c.zIndex > maxZIndex) maxZIndex = c.zIndex; });
      const newCard: WhiteboardCard = {
        ...card,
        id: `card-${Math.random().toString(36).substring(2, 11)}`,
        ownerId: playerId,
        x: card.x + 20,
        y: card.y + 20,
        zIndex: maxZIndex + 1,
        counters: [...card.counters],
      };
      yCards.set(newCard.id, newCard);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'copy', text: `copied ${cardLogName(card)}` });
      }
      break;
    }
    case 'delete':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'delete', text: `removed ${cardLogName(card)}` });
      }
      break;
    case 'moveToHand':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToHand(card);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to hand` });
      }
      break;
    case 'moveToDiscard':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDiscard(card);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to discard` });
      }
      break;
    case 'moveToExile':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToExile(card);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to exile` });
      }
      break;
    case 'moveToDeckTop':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDeckTop(card);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `put ${cardLogName(card)} on top of deck` });
      }
      break;
    case 'moveToDeckBottom':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDeckBottom(card);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `put ${cardLogName(card)} on bottom of deck` });
      }
      break;
  }
}
