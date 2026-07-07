import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { KeywordTokenTemplate } from '@/features/keyword-tokens/types';
import { attachedChildren, findParent, NODE_SIZES } from './nodeAttachment';
import { logAction } from '@/features/action-log/actionLog';
import { makeTokenId } from '@/shared/utils/ids';

export function getMaxZIndex(yCards: Y.Map<WhiteboardCard>, yTokens: Y.Map<KeywordToken>): number {
  let max = 1;
  yCards.forEach((c) => { if (c.zIndex > max) max = c.zIndex; });
  yTokens.forEach((t) => { if (t.zIndex > max) max = t.zIndex; });
  return max;
}

/** Clear `attachedTo` on any token that was attached to the given card. */
export function detachTokens(cardId: string, yTokens: Y.Map<KeywordToken>): void {
  attachedChildren(cardId, yTokens).forEach((token) => {
    yTokens.set(token.id, { ...token, attachedTo: undefined });
  });
}

export function spawnTokenAtPosition(
  template: KeywordTokenTemplate,
  flowPos: { x: number; y: number },
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  ownerId: string,
): void {
  const maxZ = getMaxZIndex(yCards, yTokens);
  const tokenX = flowPos.x - NODE_SIZES.token.width / 2;
  const tokenY = flowPos.y - NODE_SIZES.token.height / 2;
  const parentId = findParent({ x: tokenX, y: tokenY }, 'token', yCards, 'card');
  const parentCard = parentId ? yCards.get(parentId) : undefined;
  const tokenId = makeTokenId();
  yTokens.set(tokenId, {
    id: tokenId,
    title: template.title,
    imageUrl: template.imageUrl ?? '',
    backgroundColor: template.backgroundColor,
    count: template.count,
    ownerId,
    x: tokenX,
    y: tokenY,
    zIndex: parentCard ? Math.max(maxZ + 1, parentCard.zIndex + 1) : maxZ + 1,
    rotation: 0,
    attachedTo: parentId,
  });

  const yDoc = yTokens.doc;
  if (yDoc) {
    logAction(yDoc, {
      actorId: ownerId,
      type: 'spawn_token',
      text: `placed a ${template.title} token`,
    });
  }
}
