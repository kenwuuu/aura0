/**
 * useContextMenuTap
 *
 * Owns the touch **tap** gesture for every menu-bearing surface. What a tap
 * does depends on whether the surface can preview a card:
 *
 *  - **Card surfaces** (hand card, battlefield card, face-up pile-viewer card)
 *    pass a `showPreview` callback and get a **two-tap** flow: the first tap on
 *    a card shows *that card's* preview; a second tap on the *same* card opens
 *    its context menu (preview closes); a tap on a *different* card switches the
 *    preview to it (a fresh first tap). Preview and menu are never both visible.
 *  - **Non-card surfaces** (tokens, piles, the empty board) pass no
 *    `showPreview` and keep the original **single-tap → menu**, additionally
 *    clearing any stray preview so the two are mutually exclusive on touch.
 *
 * Touch has no right-click, so this is the only way to reach the context menu
 * on mobile. The gesture is:
 *  - **touch-only** — mouse interactions are ignored here, so desktop keeps
 *    right-click for the menu and left-click/hover for the element's own
 *    behaviour; nothing about the mouse pointer path changes.
 *  - **drag-aware** — a touch that travels more than `TAP_MOVE_TOLERANCE` is a
 *    drag/pan (moving a card, reordering a hand card, panning the board), not a
 *    tap, so it opens neither preview nor menu.
 *  - **click-swallowing** — a tap also synthesises a `click`, which would
 *    otherwise fire the element's own left-click handler (a token's +/-, a
 *    pile's viewer). `onClickCapture` runs in the capture phase and cancels
 *    that trailing click, so a tap does exactly one thing.
 *
 * `target` may be `null` to opt out at tap time (e.g. an opponent pile that has
 * no menu), leaving the element's normal tap behaviour untouched.
 */

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useContextMenuStore } from './contextMenuStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import type { MenuTarget } from './hotkeys';

/** Max pointer travel (px) from down to up for a touch to still count as a tap
 * rather than a drag/pan. */
const TAP_MOVE_TOLERANCE = 10;

interface UseContextMenuTapOptions {
  /** Present on card surfaces: shows *this target's* preview at (x, y). Its
   * presence switches the tap into the two-tap preview-then-menu flow. */
  showPreview?: (x: number, y: number) => void;
}

export function useContextMenuTap(target: MenuTarget | null, opts?: UseContextMenuTapOptions) {
  const showPreview = opts?.showPreview;
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

    // A tap always swallows its trailing synthetic click, whatever branch runs.
    tapConsumedRef.current = true;
    const x = e.clientX;
    const y = e.clientY;

    if (showPreview) {
      const preview = useCardPreviewStore.getState();
      const targetId = 'id' in target ? target.id : undefined;
      const previewIsThisTarget = preview.isVisible && preview.card?.id === targetId;
      if (previewIsThisTarget) {
        // Second tap on the same previewed card → open its menu.
        preview.hide();
        useContextMenuStore.getState().openMenu({ target, x, y });
      } else {
        // First tap (or switching from another card) → show this card's preview.
        // Close any open menu so preview and menu are never both visible.
        useContextMenuStore.getState().close();
        showPreview(x, y);
      }
      return;
    }

    // Non-card surface (token, pile, board): single tap opens the menu, clearing
    // any stray preview so the two are mutually exclusive on touch.
    useCardPreviewStore.getState().hide();
    useContextMenuStore.getState().openMenu({ target, x, y });
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
