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
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
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
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';

// Name to use for a card's owner in a log entry describing an action taken
// on someone else's card — null when the actor owns the card themselves, so
// callers can branch on possessive vs. first-person phrasing (mirrors
// Player.modifyHealth's self-vs-target split).
function opponentOwnerName(yDoc: Y.Doc, card: WhiteboardCard, actorId: string): string | null {
  return card.ownerId === actorId ? null : resolvePlayerName(yDoc, card.ownerId);
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
    case 'tap': {
      // card.isTapped reflects the state *before* the toggle
      const verb = card.isTapped ? 'untapped' : 'tapped';
      yCards.set(cardId, { ...card, isTapped: !card.isTapped });
      if (yDoc) {
        const ownerName = opponentOwnerName(yDoc, card, playerId);
        logAction(yDoc, {
          actorId: playerId,
          type: 'tap',
          text: ownerName ? `${verb} ${ownerName}'s ${cardLogName(card)}` : `${verb} ${cardLogName(card)}`,
        });
      }
      break;
    }
    case 'flip': {
      // card.isFlipped reflects the state *before* the toggle.
      const willBeFlipped = !card.isFlipped;
      yCards.set(cardId, { ...card, isFlipped: willBeFlipped });
      if (yDoc) {
        const ownerName = opponentOwnerName(yDoc, card, playerId);
        // Flipping face down must not name the card it's hiding; flipping
        // face up reveals it to everyone at once, so the name is now public.
        let text: string;
        if (willBeFlipped) {
          text = ownerName ? `flipped ${ownerName}'s card face down` : 'flipped a card face down';
        } else {
          text = ownerName ? `flipped ${ownerName}'s ${card.name} face up` : `flipped ${card.name} face up`;
        }
        logAction(yDoc, { actorId: playerId, type: 'flip', text });
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
        const ownerName = opponentOwnerName(yDoc, card, playerId);
        logAction(yDoc, {
          actorId: playerId,
          type: 'copy',
          text: ownerName ? `copied ${ownerName}'s ${cardLogName(card)}` : `copied ${cardLogName(card)}`,
        });
      }
      break;
    }
    // Todo: counters added this way will delete themselves when they detect they're <= 0
      // counters that are added by dragging in from the grid will not delete themselves. nor the ones
      // added with the I/U hotkeys
    case 'addCounter':
      spawnTokenAtPosition(
        { title: '+1/+1', backgroundColor: '#e8e1df', count: 1 }, // hex-ok: token data color
        nodeCenter(card, 'card'),
        yCards, yTokens, playerId,
      );
      break;
    case 'removeCounter':
      // Mirrors the 'I' global hotkey's cursor-position spawn (useAllGameHotkeys.ts)
      // — same template, just anchored to the card instead of the cursor.
      spawnTokenAtPosition(
        { title: '-1/-1', backgroundColor: '#e8e1df', count: -1 }, // hex-ok: token data color
        nodeCenter(card, 'card'),
        yCards, yTokens, playerId,
      );
      break;
    case 'delete':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      if (yDoc) {
        const ownerName = opponentOwnerName(yDoc, card, playerId);
        logAction(yDoc, {
          actorId: playerId,
          type: 'delete',
          text: ownerName ? `removed ${ownerName}'s ${cardLogName(card)}` : `removed ${cardLogName(card)}`,
        });
      }
      break;
    // The moveTo* actions below delegate placement, deck persistence, and
    // logging to their matching battlefieldActions export (a complete
    // semantic action) — this handler only owns the battlefield-specific
    // steps: close the menu, detach any attached tokens, and remove the card
    // from the board.
    case 'moveToHand':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToHand(card);
      break;
    case 'moveToDiscard':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDiscard(card);
      break;
    case 'moveToExile':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToExile(card);
      break;
    case 'moveToDeckTop':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDeckTop(card);
      break;
    case 'moveToDeckBottom':
      useContextMenuStore.getState().close();
      detachTokens(cardId, yTokens);
      yCards.delete(cardId);
      moveCardToDeckBottom(card);
      break;
  }
}
