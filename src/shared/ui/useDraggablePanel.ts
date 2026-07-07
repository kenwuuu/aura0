/**
 * useDraggablePanel — makes a screen-space panel draggable by a handle, clamped
 * to the viewport, with its position persisted per `persistKey`.
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

/** Keep a position fully inside the viewport given the panel's measured size. */
function clampToViewport(pos: Position, el: HTMLElement | null): Position {
  if (!el) return pos;
  const { width, height } = el.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
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
    },
  };
}
