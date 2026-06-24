/**
 * Hotkey menu state (replaces the imperative TooltipManager class).
 *
 * One store drives a single Radix Popover (`HotkeyMenu`) for two modes:
 *  - `menu`: an actionable right-click context menu (battlefield cards,
 *    pile-viewer cards). Rows are clickable and call `onSelect`.
 *  - `hint`: a non-interactive hover hint (battlefield tokens, token picker).
 *    Rows just display the bindings; the caller drives open/close via hover.
 *
 * Still-imperative call sites (board, token grids) drive it through
 * `getState().openMenu/showHint/close`; React call sites can subscribe directly.
 */

import { create } from 'zustand';
import type { HotkeyContext, Hotkey } from './hotkeys';

export type HotkeyMenuMode = 'menu' | 'hint';

interface OpenMenuArgs {
  cardId: string;
  context: HotkeyContext;
  x: number;
  y: number;
  title?: string;
  onSelect: (hotkey: Hotkey, cardId: string) => void;
}

interface ShowHintArgs {
  context: HotkeyContext;
  x: number;
  y: number;
  title?: string;
}

interface HotkeyMenuState {
  isOpen: boolean;
  mode: HotkeyMenuMode;
  x: number;
  y: number;
  context: HotkeyContext | null;
  cardId: string | null;
  title?: string;
  onSelect: ((hotkey: Hotkey, cardId: string) => void) | null;
  /** Open the actionable right-click context menu at (x, y). */
  openMenu: (args: OpenMenuArgs) => void;
  /** Show a non-interactive hover hint at (x, y). */
  showHint: (args: ShowHintArgs) => void;
  /** Close the menu/hint. */
  close: () => void;
}

export const useHotkeyMenuStore = create<HotkeyMenuState>((set) => ({
  isOpen: false,
  mode: 'menu',
  x: 0,
  y: 0,
  context: null,
  cardId: null,
  title: undefined,
  onSelect: null,
  openMenu: ({ cardId, context, x, y, title, onSelect }) =>
    set({ isOpen: true, mode: 'menu', cardId, context, x, y, title, onSelect }),
  showHint: ({ context, x, y, title }) =>
    set({ isOpen: true, mode: 'hint', context, x, y, title, cardId: null, onSelect: null }),
  close: () => set({ isOpen: false, onSelect: null }),
}));