/**
 * useContextMenuTap
 *
 * Owns the touch **tap** gesture for every menu-bearing surface. What a tap
 * does depends on whether the surface can preview a card:
 *
 *  - **Card surfaces** pass a `showPreview` callback and get a **two-tap** flow.
 *    Both taps act on the *same* card; tapping a *different* card is always a
 *    fresh first tap. Preview and menu are never both visible. Which of the two
 *    comes first depends on what you're usually there to do:
 *      - *preview-first* (hand card, face-up pile-viewer card): tap 1 previews,
 *        tap 2 opens the menu. You're usually there to identify the card.
 *      - *menu-first* (`menuFirst: true` — battlefield card): tap 1 opens the
 *        menu, tap 2 swaps it for the preview. On the board you mostly want to
 *        *act* on a card (tap, flip, counter), so the menu is the common case.
 *  - **Non-card surfaces** (tokens, piles, the empty board) pass no
 *    `showPreview` and keep the original **single-tap → menu**, additionally
 *    clearing any stray preview so the two are mutually exclusive on touch.
 *    A `null` target opts out entirely (an opponent pile: no menu, so the tap
 *    falls through to the element's own click, which opens their pile viewer).
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

/** How close (px) a trailing synthetic click must be to the tap point to be
 * treated as that tap's compat click and swallowed. A deliberate tap on a menu
 * row lands elsewhere, so it stays clickable. */
const TRAILING_CLICK_SLOP = 8;

// A touch tap synthesises a trailing `click` a few ms later. `onClickCapture`
// on the tapped element cancels it there — but when the tap opens a menu that
// renders *under the finger* (a hand card's menu opens just above the tap
// point), that click lands on a menu row instead and would activate it, closing
// the menu we just opened. This document-level, capture-phase swallow catches
// that click by matching its coordinates to the tap point, independent of which
// element it hit or how delayed it is. It's coordinate-matched, not time-boxed,
// so a *deliberate* tap on a menu row (at different coordinates) still works.
let pendingTapClickAt: { x: number; y: number } | null = null;
let clickSwallowerInstalled = false;

function installTrailingClickSwallower(): void {
  if (clickSwallowerInstalled || typeof document === 'undefined') return;
  clickSwallowerInstalled = true;
  document.addEventListener(
    'click',
    (e) => {
      const p = pendingTapClickAt;
      if (!p) return;
      pendingTapClickAt = null;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TRAILING_CLICK_SLOP) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

installTrailingClickSwallower();

interface UseContextMenuTapOptions {
  /** Present on card surfaces: shows *this target's* preview at (x, y). Its
   * presence switches the tap into the two-tap preview-then-menu flow. */
  showPreview?: (x: number, y: number) => void;
  /** Card surfaces only. Inverts the two-tap order: the **first** tap opens the
   * menu and a **second** tap on the same card previews it. Battlefield cards
   * use this — on the board you mostly want to *act* on a card (tap, flip,
   * counter), so the menu is the common case and the preview is the follow-up.
   * Hand and pile-viewer cards keep preview-first, where identifying the card
   * is what you're usually there for. */
  menuFirst?: boolean;
}

/** Whether two menu targets denote the same game item. `kind` alone isn't
 * enough (two cards, two piles), so compare the discriminating field each kind
 * carries. */
function isSameTarget(a: MenuTarget, b: MenuTarget): boolean {
  if (a.kind !== b.kind) return false;
  const id = (t: MenuTarget) => ('id' in t ? t.id : undefined);
  const pile = (t: MenuTarget) => ('pileType' in t ? t.pileType : undefined);
  return id(a) === id(b) && pile(a) === pile(b);
}

export function useContextMenuTap(target: MenuTarget | null, opts?: UseContextMenuTapOptions) {
  const showPreview = opts?.showPreview;
  const menuFirst = opts?.menuFirst ?? false;
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);
  // True between opening the menu on a tap and swallowing the click it
  // synthesises. Reset at the start of every new pointer interaction so a
  // browser that skips the synthetic click can't leave it stuck.
  const tapConsumedRef = useRef(false);
  // Was *this* target's menu already open when the gesture began? Must be
  // snapshotted at pointer-DOWN: the menu is a Radix dismissable layer, and a
  // tap on the card is an outside pointer-down, so Radix has already closed it
  // by the time pointer-up runs. Reading the store at pointer-up would always
  // see "no menu open" and re-open it — the second tap could never advance to
  // the preview. (happy-dom has no Radix layer, so a unit test would pass
  // either way; the e2e board-card spec is what actually guards this.)
  const menuWasOpenForTargetRef = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    tapConsumedRef.current = false;
    // A new gesture: drop any stale pending trailing-click swallow (e.g. a
    // browser that skipped the previous tap's synthetic click).
    pendingTapClickAt = null;
    const menu = useContextMenuStore.getState();
    menuWasOpenForTargetRef.current =
      !!target && menu.isOpen && !!menu.target && isSameTarget(menu.target, target);
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
    // Both the element-scoped `onClickCapture` (for a click on this element) and
    // the document-level coordinate swallow (for a click that lands on a menu we
    // just opened under the finger) are armed.
    tapConsumedRef.current = true;
    pendingTapClickAt = { x: e.clientX, y: e.clientY };
    const x = e.clientX;
    const y = e.clientY;
    // A finger covers what it touches, so the touch point is a bad anchor for
    // the menu: opened there, it lands on top of the very item you tapped. That
    // leaves the item invisible *and untappable while its own menu is open* —
    // which is fatal for the battlefield card, whose second tap (menu → preview)
    // has to land back on the card. Anchor to the tapped element's box instead
    // and Radix places the menu beside it. A mouse right-click keeps its
    // point anchor: a cursor is a point and covers nothing.
    const r = e.currentTarget.getBoundingClientRect();
    const anchorRect = { x: r.x, y: r.y, width: r.width, height: r.height };

    // Every openMenu below is a touch tap, so pass viaTouch:true — that's what
    // surfaces a token's touch-only +1/-1 rows (see the `touchMenuOnly` doc on
    // the Hotkey type / the filter in GameContextMenu).
    if (showPreview && menuFirst) {
      // Menu-first card surface (the battlefield): first tap opens the menu, a
      // second tap on the same card swaps it for the preview. Tapping a
      // *different* card is a fresh first tap — it opens that card's menu.
      if (menuWasOpenForTargetRef.current) {
        useContextMenuStore.getState().close();
        showPreview(x, y);
      } else {
        useCardPreviewStore.getState().hide();
        useContextMenuStore.getState().openMenu({ target, x, y, viaTouch: true, anchorRect });
      }
      return;
    }

    if (showPreview) {
      const preview = useCardPreviewStore.getState();
      const targetId = 'id' in target ? target.id : undefined;
      const previewIsThisTarget = preview.isVisible && preview.card?.id === targetId;
      if (previewIsThisTarget) {
        // Second tap on the same previewed card → open its menu.
        preview.hide();
        useContextMenuStore.getState().openMenu({ target, x, y, viaTouch: true, anchorRect });
      } else {
        // First tap (or switching from another card) → show this card's preview.
        // Close any open menu so preview and menu are never both visible.
        useContextMenuStore.getState().close();
        showPreview(x, y);
      }
      return;
    }

    // Non-card surface (token, pile): single tap opens the menu, clearing any
    // stray preview so the two are mutually exclusive on touch.
    useCardPreviewStore.getState().hide();
    useContextMenuStore.getState().openMenu({ target, x, y, viaTouch: true, anchorRect });
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
