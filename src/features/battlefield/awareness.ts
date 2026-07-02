import type { DragNodeState } from './useBattlefieldNodes';

export interface CursorState { x: number; y: number; }

export interface BattlefieldAwareness {
  drag?: { nodes: DragNodeState[] } | null;
  cursor?: CursorState | null;
}

export const AWARENESS_DRAG = 'drag' as const;
export const AWARENESS_CURSOR = 'cursor' as const;
