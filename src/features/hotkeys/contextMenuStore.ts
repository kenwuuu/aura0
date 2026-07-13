/**
 * Game context-menu state (replaces `hotkeyMenuStore`).
 *
 * Drives a single `GameContextMenu` (a controlled shadcn `DropdownMenu`)
 * pinned to the cursor. Unlike the old store, this one doesn't carry an
 * `onSelect` callback or a `hint` mode — the menu derives its rows from
 * `target` via `getMenuActionsForTarget` and dispatches clicks itself via
 * `dispatchGameAction`, so every call site just says "open a menu for this
 * target here."
 */

import { create } from 'zustand';
import type { MenuTarget } from './hotkeys';

/** Screen-space box of the item a menu belongs to. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OpenMenuArgs {
  target: MenuTarget;
  x: number;
  y: number;
  /** True when opened by a touch tap rather than a mouse right-click. Gates
   * `touchMenuOnly` rows (e.g. a token's +1/-1) that desktop reaches by
   * clicking the item directly. Defaults to false. */
  viaTouch?: boolean;
  /** The tapped item's box. When set, the menu is placed beside *the item*
   * rather than at (x, y) — see `anchorRect` on the state below. */
  anchorRect?: AnchorRect | null;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  target: MenuTarget | null;
  /** Whether the currently-open menu was opened by a touch tap. */
  viaTouch: boolean;
  /**
   * The box of the item the menu belongs to, when it should anchor to the item
   * instead of to (x, y).
   *
   * A mouse cursor is a point, so pinning the menu to it is right on desktop.
   * A finger is not: it *covers* what it touched, and a menu opened at the
   * touch point lands on top of the very item you tapped. That makes the item
   * untappable while its own menu is open — which breaks the battlefield card's
   * second tap (the one that swaps the menu for the preview), and means you
   * can't see the card you're choosing an action for. Tap-opened menus
   * therefore anchor to the tapped element's rect, so Radix places them
   * *beside* it. Null for mouse right-clicks and for the empty-board menu,
   * where there is no item and the point is the right anchor.
   */
  anchorRect: AnchorRect | null;
  /** Open the context menu for `target` at (x, y), or beside `anchorRect`. */
  openMenu: (args: OpenMenuArgs) => void;
  /** Close the menu. Leaves `target`/(x, y) in place so the close animation
   * doesn't flash empty content. */
  close: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  target: null,
  viaTouch: false,
  anchorRect: null,
  openMenu: ({ target, x, y, viaTouch = false, anchorRect = null }) =>
    set({ isOpen: true, target, x, y, viaTouch, anchorRect }),
  close: () => set({ isOpen: false }),
}));
