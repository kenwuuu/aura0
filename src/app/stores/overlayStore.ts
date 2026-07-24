/**
 * overlayStore
 *
 * Open-state for the app-shell overlays that more than one surface needs to
 * drive: the command palette (⌘K launcher + keyboard), the Help modal (toolbar
 * button, overflow menu, and the palette's "Open Help" command), and the deck
 * selection modal (its own button + the palette's "Import a deck" command).
 *
 * Lives in `app/` because it crosses feature boundaries (deck-manager, the
 * palette, the toolbar) — see `src/app/CLAUDE.md`. Purely UI state; no game
 * mutations. Each overlay is a boolean field named `${key}Open`.
 */
import { create } from 'zustand';

export type OverlayKey = 'commandPalette' | 'help' | 'deckSelection';

interface OverlayStore {
  commandPaletteOpen: boolean;
  helpOpen: boolean;
  deckSelectionOpen: boolean;
  set: (key: OverlayKey, open: boolean) => void;
  open: (key: OverlayKey) => void;
  close: (key: OverlayKey) => void;
  toggle: (key: OverlayKey) => void;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  commandPaletteOpen: false,
  helpOpen: false,
  deckSelectionOpen: false,
  set: (key, open) => set({ [`${key}Open`]: open } as Partial<OverlayStore>),
  open: (key) => get().set(key, true),
  close: (key) => get().set(key, false),
  toggle: (key) => get().set(key, !get()[`${key}Open`]),
}));
