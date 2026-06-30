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
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

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
  if (action === 'untapAll') {
    yCards.forEach((c, cId) => {
      if (c.ownerId === playerId && c.isTapped) {
        yCards.set(cId, { ...c, isTapped: false });
      }
    });
    return;
  }

  const card = yCards.get(cardId);
  if (!card) return;

  switch (action) {
    case 'tap':
      yCards.set(cardId, { ...card, isTapped: !card.isTapped });
      break;
    case 'flip':
      yCards.set(cardId, { ...card, isFlipped: !card.isFlipped });
      break;
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
      break;
    }
    case 'delete':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      break;
    case 'moveToHand':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToHand(card);
      yCards.delete(cardId);
      break;
    case 'moveToDiscard':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDiscard(card);
      yCards.delete(cardId);
      break;
    case 'moveToExile':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToExile(card);
      yCards.delete(cardId);
      break;
    case 'moveToDeckTop':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDeckTop(card);
      yCards.delete(cardId);
      break;
    case 'moveToDeckBottom':
      useCardPreviewStore.getState().hide();
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      useGameInstance.getState().moveCardToDeckBottom(card);
      yCards.delete(cardId);
      break;
  }
}
