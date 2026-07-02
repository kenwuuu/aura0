import type { DragNodeState } from './useBattlefieldNodes';

export interface CursorState { x: number; y: number; }

export interface BattlefieldAwareness {
  drag?: { nodes: DragNodeState[] } | null;
  cursor?: CursorState | null;
}

export const AWARENESS_DRAG = 'drag' as const;
export const AWARENESS_CURSOR = 'cursor' as const;

export function colorForPeer(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 60%)`;
}
