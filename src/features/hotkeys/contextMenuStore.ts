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

interface OpenMenuArgs {
  target: MenuTarget;
  x: number;
  y: number;
  /** True when opened by a touch tap rather than a mouse right-click. Gates
   * `touchMenuOnly` rows (e.g. a token's +1/-1) that desktop reaches by
   * clicking the item directly. Defaults to false. */
  viaTouch?: boolean;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  target: MenuTarget | null;
  /** Whether the currently-open menu was opened by a touch tap. */
  viaTouch: boolean;
  /** Open the context menu for `target` at (x, y). */
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
  openMenu: ({ target, x, y, viaTouch = false }) => set({ isOpen: true, target, x, y, viaTouch }),
  close: () => set({ isOpen: false }),
}));
