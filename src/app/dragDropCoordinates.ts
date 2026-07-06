/**
 * Pure coordinate extraction for tracking the live pointer/touch position
 * during a hand-card drag — extracted from `App.tsx` so it's unit-testable
 * without rendering the app shell.
 *
 * Deliberately NOT derived from dnd-kit's `DragEndEvent.delta`: that value is
 * `scrollAdjustedTranslate`, compensated for how far the dragged element's
 * scrollable ancestors moved during the drag. The hand strip (`.hand-scroll`)
 * auto-scrolls horizontally as cards are drawn, so combining a fixed
 * `activatorEvent` origin with that scroll-adjusted delta double-counts the
 * hand's scroll offset — the computed drop point silently drifts by an amount
 * tied to how far the hand has auto-scrolled since the session started.
 * Tracking the raw client position directly sidesteps that entirely.
 */

export function coordinatesFromPointerEvent(e: Pick<PointerEvent, 'clientX' | 'clientY'>): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY };
}

/** Returns null if the touch already lifted (empty `touches`) by the time this fires. */
export function coordinatesFromTouchMoveEvent(e: Pick<TouchEvent, 'touches'>): { x: number; y: number } | null {
  const touch = e.touches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}
