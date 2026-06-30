import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { KeywordTokenTemplate } from '@/features/keyword-tokens/types';
import { findParent, NODE_SIZES } from './nodeAttachment';

export function getMaxZIndex(yCards: Y.Map<WhiteboardCard>, yTokens: Y.Map<KeywordToken>): number {
  let max = 0;
  yCards.forEach((c) => { if (c.zIndex > max) max = c.zIndex; });
  yTokens.forEach((t) => { if (t.zIndex > max) max = t.zIndex; });
  return max;
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
  const tokenId = `token-${Math.random().toString(36).substring(2, 11)}`;
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
}
