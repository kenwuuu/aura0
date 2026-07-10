/**
 * useContextMenuTap
 *
 * Opens the game context menu on a touch **tap**, mirroring what a right-click
 * does with a mouse. Touch devices have no right-click, so the context menu —
 * the primary way to act on a card/token/pile on mobile — was otherwise
 * unreachable.
 *
 * Spread the returned handlers onto any menu-bearing element. The gesture is:
 *  - **touch-only** — mouse interactions are ignored here, so desktop keeps
 *    right-click for the menu and left-click for the element's own action;
 *    nothing about the mouse pointer path changes.
 *  - **drag-aware** — a touch that travels more than `TAP_MOVE_TOLERANCE` is a
 *    drag/pan (moving a card, reordering a hand card, panning the board), not a
 *    tap, so it never opens the menu.
 *  - **click-swallowing** — a tap also synthesises a `click`, which would
 *    otherwise fire the element's own left-click handler (a token's +/-, a
 *    pile's viewer). `onClickCapture` runs in the capture phase and cancels
 *    that trailing click so a tap does exactly one thing: open the menu, just
 *    like a right-click.
 *
 * `target` may be `null` to opt out at tap time (e.g. an opponent pile that has
 * no menu), leaving the element's normal tap behaviour untouched.
 */

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useContextMenuStore } from './contextMenuStore';
import type { MenuTarget } from './hotkeys';

/** Max pointer travel (px) from down to up for a touch to still count as a tap
 * rather than a drag/pan. */
const TAP_MOVE_TOLERANCE = 10;

export function useContextMenuTap(target: MenuTarget | null) {
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);
  // True between opening the menu on a tap and swallowing the click it
  // synthesises. Reset at the start of every new pointer interaction so a
  // browser that skips the synthetic click can't leave it stuck.
  const tapConsumedRef = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    tapConsumedRef.current = false;
    if (e.pointerType === 'mouse') {
      startRef.current = null;
      return;
    }
    startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start || e.pointerId !== start.id || e.pointerType === 'mouse' || !target) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MOVE_TOLERANCE) return;
    tapConsumedRef.current = true;
    useContextMenuStore.getState().openMenu({ target, x: e.clientX, y: e.clientY });
  };

  const onPointerCancel = () => {
    startRef.current = null;
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (!tapConsumedRef.current) return;
    tapConsumedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture };
}
