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
import type { HelpSectionId } from '@/app/content/help/sections';

export type OverlayKey = 'commandPalette' | 'help' | 'deckSelection';

/**
 * Where in Help to land. Mirrors `settingsModalStore`'s `initialSectionId`: any
 * surface can send a player straight to the thing they asked about instead of
 * dropping them at the top of the guide to hunt.
 *
 * Typing `section` as `HelpSectionId` rather than `string` is the whole point of
 * the authored ids in `content/help/sections.ts` — a caller pointing at a
 * section that has since been deleted fails to compile, rather than silently
 * opening the modal at the top.
 */
export type HelpTarget =
  | { tab: 'guide'; section: HelpSectionId }
  | { tab: 'shortcuts' };

interface OverlayStore {
  commandPaletteOpen: boolean;
  helpOpen: boolean;
  deckSelectionOpen: boolean;
  /** Consumed by HelpModal while open; cleared when Help closes. */
  helpTarget: HelpTarget | null;
  set: (key: OverlayKey, open: boolean) => void;
  open: (key: OverlayKey) => void;
  close: (key: OverlayKey) => void;
  toggle: (key: OverlayKey) => void;
  /**
   * Open Help, optionally at a specific tab and section. `open('help')` still
   * works and means "no particular destination", which is what the toolbar
   * button and the palette's generic "Open Help" command want.
   */
  openHelp: (target?: HelpTarget) => void;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  commandPaletteOpen: false,
  helpOpen: false,
  deckSelectionOpen: false,
  helpTarget: null,
  set: (key, open) =>
    set({
      [`${key}Open`]: open,
      // A closed Help must not keep a stale target, or the next plain
      // `open('help')` would jump to wherever the last deep link pointed.
      ...(key === 'help' && !open ? { helpTarget: null } : {}),
    } as Partial<OverlayStore>),
  open: (key) => get().set(key, true),
  close: (key) => get().set(key, false),
  toggle: (key) => get().set(key, !get()[`${key}Open`]),
  openHelp: (target) => set({ helpOpen: true, helpTarget: target ?? null }),
}));
