/**
 * Generic node stacking helpers.
 *
 * Any node type registered in NODE_SIZES can participate in stacking: when a
 * child node's center falls inside a parent node's bounds, it becomes attached.
 * Positions stay absolute (no react-flow parentId / relative coords). The
 * `attachedTo` field on the child stores the parent's id.
 *
 * To make a new node type stackable:
 *   1. Add its size to NODE_SIZES below (keyed by the react-flow node type string).
 *   2. Add `attachedTo?: string` to the child type's TypeScript interface.
 * No other changes are required in this file.
 *
 * These helpers are pure (no react-flow, no Yjs writes) so they can be unit-
 * tested in isolation.
 */
import * as Y from 'yjs';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { TOKEN_SIZE } from './nodes/TokenNode';

/**
 * Node size registry keyed by react-flow node type string.
 * Add an entry here to make a new node type participate in stacking.
 */
export const NODE_SIZES: Record<string, { width: number; height: number }> = {
  card: { width: CARD_WIDTH, height: CARD_HEIGHT },
  token: { width: TOKEN_SIZE, height: TOKEN_SIZE },
};

/** The center of a node in board coordinates. */
export function nodeCenter(
  nodePos: { x: number; y: number },
  nodeType: string,
): { x: number; y: number } {
  const { width, height } = NODE_SIZES[nodeType] ?? { width: 0, height: 0 };
  return { x: nodePos.x + width / 2, y: nodePos.y + height / 2 };
}

/**
 * Whether a point lies within a node's upright bounding box. Rotated nodes
 * (e.g., tapped cards) are approximated by their un-rotated bounds — the
 * small inaccuracy isn't worth the added complexity.
 */
export function nodeContainsPoint(
  nodePos: { x: number; y: number },
  nodeType: string,
  point: { x: number; y: number },
): boolean {
  const { width, height } = NODE_SIZES[nodeType] ?? { width: 0, height: 0 };
  return (
    point.x >= nodePos.x &&
    point.x <= nodePos.x + width &&
    point.y >= nodePos.y &&
    point.y <= nodePos.y + height
  );
}

/**
 * The id of the topmost (highest zIndex) candidate node whose bounds contain
 * the child's center. Returns undefined when no candidate contains the child.
 */
export function findParent<P extends { id: string; x: number; y: number; zIndex: number }>(
  childPos: { x: number; y: number },
  childType: string,
  candidates: Y.Map<P>,
  parentType: string,
): string | undefined {
  const center = nodeCenter(childPos, childType);
  let bestId: string | undefined;
  let bestZ = -Infinity;
  candidates.forEach((candidate) => {
    if (nodeContainsPoint(candidate, parentType, center) && candidate.zIndex > bestZ) {
      bestZ = candidate.zIndex;
      bestId = candidate.id;
    }
  });
  return bestId;
}

/** All nodes in yMap that are attached to the given parent id. */
export function attachedChildren<C extends { id: string; attachedTo?: string }>(
  parentId: string,
  yMap: Y.Map<C>,
): C[] {
  const result: C[] = [];
  yMap.forEach((obj) => {
    if (obj.attachedTo === parentId) result.push(obj);
  });
  return result;
}
