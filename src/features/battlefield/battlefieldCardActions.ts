/**
 * Battlefield card actions
 *
 * Centralized logic for executing actions on battlefield cards.
 * Used by both keyboard hotkeys and context menu clicks.
 */

import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { nodeCenter } from './nodeAttachment';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { logAction, cardLogName } from '@/features/action-log/actionLog';
import { spawnTokenAtPosition, getMaxZIndex, detachTokens } from './spawnToken';
import {
  moveCardToHand,
  moveCardToDiscard,
  moveCardToExile,
  moveCardToDeckTop,
  moveCardToDeckBottom,
} from './battlefieldActions';
import { makeCardId } from '@/shared/utils/ids';

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
      const maxZIndex = getMaxZIndex(yCards, yTokens);
      const newCard: WhiteboardCard = {
        ...card,
        id: makeCardId(),
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
    // Todo: counters added this way will delete themselves when they detect they're <= 0
      // counters that are added by dragging in from the grid will not delete themselves. nor the ones
      // added with the I/U hotkeys
    case 'addCounter':
      spawnTokenAtPosition(
        { title: '+1/+1', backgroundColor: '#e8e1df', count: 1 },
        nodeCenter(card, 'card'),
        yCards, yTokens, playerId,
      );
      break;
    case 'removeCounter':
      // Mirrors the 'I' global hotkey's cursor-position spawn (useAllGameHotkeys.ts)
      // — same template, just anchored to the card instead of the cursor.
      spawnTokenAtPosition(
        { title: '-1/-1', backgroundColor: '#e8e1df', count: -1 },
        nodeCenter(card, 'card'),
        yCards, yTokens, playerId,
      );
      break;
    case 'delete':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      if (yDoc) {
        logAction(yDoc, { actorId: playerId, type: 'delete', text: `removed ${cardLogName(card)}` });
      }
      break;
    // The moveTo* actions below delegate placement, deck persistence, and
    // logging to their matching battlefieldActions export (a complete
    // semantic action) — this handler only owns the battlefield-specific
    // steps: close the menu, detach any attached tokens, and remove the card
    // from the board.
    case 'moveToHand':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToHand(card);
      break;
    case 'moveToDiscard':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDiscard(card);
      break;
    case 'moveToExile':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToExile(card);
      break;
    case 'moveToDeckTop':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDeckTop(card);
      break;
    case 'moveToDeckBottom':
      useHotkeyMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDeckBottom(card);
      break;
  }
}
