import { Node } from '@xyflow/react';

/**
 * Above any card zIndex reachable through normal play (cards climb by
 * incrementing from the current max — see battlefieldCardActions.ts /
 * spawnToken.ts's getMaxZIndex), so the hovered health widget always wins.
 */
export const HEALTH_HOVER_Z_INDEX = 1_000_000;

/**
 * Elevates the hovered health node above every other node so a player can see
 * and interact with it even when cards are stacked on top. Returns `nodes`
 * unchanged (same reference) when nothing is hovered, so the hovered node's
 * zIndex reverts to whatever usePlaymatNodes last computed for it.
 */
export function applyHealthHoverElevation(
  nodes: Node[],
  hoveredHealthNodeId: string | null,
): Node[] {
  if (!hoveredHealthNodeId) return nodes;
  return nodes.map((n) =>
    n.id === hoveredHealthNodeId ? { ...n, zIndex: HEALTH_HOVER_Z_INDEX } : n,
  );
}
