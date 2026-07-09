import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

interface UseReflowSafeHoverOptions {
  /** Ids of every hoverable item currently rendered. */
  presentIds: string[];
  onEnter: (id: string) => void;
  onLeave: () => void;
  onMove?: (x: number, y: number) => void;
}

/**
 * `onMouseEnter`/`onMouseLeave` only fire on real pointer movement. When the
 * hovered item unmounts (e.g. a hotkey moved it elsewhere) and a sibling
 * reflows into its screen slot, neither event fires — the pointer itself
 * never moved. This re-derives hover from the last known pointer position via
 * `elementFromPoint` whenever the tracked item disappears from `presentIds`,
 * so the next interaction lands on whatever is now under the cursor instead
 * of silently targeting the gone item. Items must carry a `data-card-id`
 * attribute matching their id for the resync lookup to find them.
 */
export function useReflowSafeHover({ presentIds, onEnter, onLeave, onMove }: UseReflowSafeHoverOptions) {
  const hoveredIdRef = useRef<string | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseEnter = useCallback((id: string) => {
    hoveredIdRef.current = id;
    onEnter(id);
  }, [onEnter]);

  const handleMouseLeave = useCallback(() => {
    hoveredIdRef.current = null;
    onLeave();
  }, [onLeave]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    onMove?.(e.clientX, e.clientY);
  }, [onMove]);

  useEffect(() => {
    const hoveredId = hoveredIdRef.current;
    if (!hoveredId || presentIds.includes(hoveredId)) return;
    const pos = lastMousePosRef.current;
    const el = pos ? document.elementFromPoint(pos.x, pos.y) : null;
    const nextId = el instanceof Element ? el.closest<HTMLElement>('[data-card-id]')?.dataset.cardId : undefined;
    if (nextId) {
      handleMouseEnter(nextId);
    } else {
      handleMouseLeave();
    }
  }, [presentIds, handleMouseEnter, handleMouseLeave]);

  return { handleMouseEnter, handleMouseMove, handleMouseLeave };
}
