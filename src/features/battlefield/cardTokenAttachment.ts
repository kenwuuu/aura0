/**
 * Card ↔ token attachment geometry.
 *
 * A token is "attached" to a card when the token's CENTER falls inside the
 * card's bounds. While attached, the token moves with the card (see the drag
 * handlers in BattlefieldCanvas) and always renders above it. The relationship
 * is stored explicitly on the token as `attachedTo` (the card's id) — positions
 * stay absolute, matching the rest of the board model.
 *
 * These helpers are pure (no react-flow, no Yjs writes) so they can be unit
 * tested in isolation.
 */
import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { TOKEN_SIZE } from './nodes/TokenNode';

/** The token's center point in board coordinates. */
export function tokenCenter(token: KeywordToken): { x: number; y: number } {
  return { x: token.x + TOKEN_SIZE / 2, y: token.y + TOKEN_SIZE / 2 };
}

/**
 * Whether a point lies within a card's upright bounding box. Tapped cards are
 * rendered rotated 90°, but we intentionally use the un-rotated box here — the
 * small inaccuracy isn't worth the added complexity.
 */
export function cardContainsPoint(card: WhiteboardCard, point: { x: number; y: number }): boolean {
  return (
    point.x >= card.x &&
    point.x <= card.x + CARD_WIDTH &&
    point.y >= card.y &&
    point.y <= card.y + CARD_HEIGHT
  );
}

/**
 * The id of the card a token should attach to: the topmost (highest zIndex)
 * card whose bounds contain the token's center. Returns undefined when the
 * token's center is over no card.
 */
export function findParentCard(token: KeywordToken, yCards: Y.Map<WhiteboardCard>): string | undefined {
  const center = tokenCenter(token);
  let bestId: string | undefined;
  let bestZ = -Infinity;
  yCards.forEach((card) => {
    if (cardContainsPoint(card, center) && card.zIndex > bestZ) {
      bestZ = card.zIndex;
      bestId = card.id;
    }
  });
  return bestId;
}

/** All tokens currently attached to the given card. */
export function attachedTokens(cardId: string, yTokens: Y.Map<KeywordToken>): KeywordToken[] {
  const result: KeywordToken[] = [];
  yTokens.forEach((token) => {
    if (token.attachedTo === cardId) result.push(token);
  });
  return result;
}
