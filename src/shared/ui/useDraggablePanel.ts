/**
 * useDraggablePanel — makes a screen-space panel draggable by a handle, clamped
 * to the viewport (and below the top menu bar) with its position persisted per
 * `persistKey`.
 *
 * Screen-space on purpose: HUD windows (toolbar, action log) must not pan/zoom
 * with the react-flow board, so this is plain fixed-position DOM, not a board
 * node. Drag is driven by raw pointer events with pointer capture — no dnd-kit —
 * so it never interacts with the card drag-and-drop context.
 *
 * Position is stored in useSettingsStore (persisted with the rest of a player's
 * preferences), keyed by `persistKey`, so a player's HUD layout survives reloads
 * and travels with their other settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/app/stores/settingsStore';

export interface Position {
  x: number;
  y: number;
}

/**
 * Pointer handlers that drive a drag. Spread onto whichever element should act
 * as the drag handle. Exposed as a named type so a custom handle (e.g. the one
 * FloatingPanel's `renderHandle` builds) can be typed against it.
 */
export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

// Selector for the app's top menu bar (see src/app/Toolbar.tsx). Measured live
// rather than hardcoded so the clamp keeps working across a toolbar redesign —
// only the testid needs to survive, not any particular height. Falls back to 0
// (no floor) when absent, e.g. in unit-test harnesses that don't mount it.
const TOP_BAR_SELECTOR = '[data-testid="toolbar"]';

function getTopBarBottom(): number {
  return document.querySelector(TOP_BAR_SELECTOR)?.getBoundingClientRect().bottom ?? 0;
}

/**
 * Keep a position fully inside the viewport given the panel's measured size,
 * and below the top menu bar so a panel can never be dragged under it (where
 * it'd be unreachable — the bar renders above at z-index 1000).
 */
function clampToViewport(pos: Position, el: HTMLElement | null): Position {
  if (!el) return pos;
  const { width, height } = el.getBoundingClientRect();
  const minY = getTopBarBottom();
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(minY, window.innerHeight - height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(minY, pos.y), maxY),
  };
}

export function useDraggablePanel(persistKey: string, defaultPosition: Position) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(
    () => useSettingsStore.getState().panelPositions[persistKey] ?? defaultPosition,
  );
  // Live drag origin; null when not dragging.
  const dragRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);

  // Re-clamp on mount (measured size known) and whenever the window resizes, so
  // a persisted position from a larger window can't strand the panel off-screen.
  useEffect(() => {
    const reclamp = () => setPos((p) => clampToViewport(p, containerRef.current));
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button only
      e.preventDefault();
      // Optional-chained: not all environments (e.g. happy-dom in tests)
      // implement pointer capture.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { pointerX: e.clientX, pointerY: e.clientY, originX: pos.x, originY: pos.y };
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = clampToViewport(
      { x: d.originX + (e.clientX - d.pointerX), y: d.originY + (e.clientY - d.pointerY) },
      containerRef.current,
    );
    setPos(next);
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      // Persist wherever we landed (the clamped value held in state).
      setPos((current) => {
        useSettingsStore.getState().setPanelPosition(persistKey, current);
        return current;
      });
    },
    [persistKey],
  );

  return {
    containerRef,
    /** Spread onto the fixed-position container. */
    position: pos,
    /** Spread onto the drag handle element. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    } satisfies DragHandleProps,
  };
}
