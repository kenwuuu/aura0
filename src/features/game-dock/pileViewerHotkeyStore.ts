/**
 * Pile-viewer hotkey bridge (Zustand)
 *
 * The pile-viewer move shortcuts live in the global hotkey layer
 * (`useAllGameHotkeys`), but the actual move depends on the *currently open*
 * pile viewer — its card list and its source-pile-bound callbacks live in the
 * React `PileViewerReact` component. This store is the seam between them:
 * the open viewer registers an `actionHandler`, and the hotkey layer invokes it.
 *
 * Replaces the old `window.dispatchEvent('pileViewerCardAction')` bus.
 */

import { create } from 'zustand';

/** Applies `action` (moveToHand, moveToDiscard, …) to the card `cardId`. */
export type PileViewerActionHandler = (action: string, cardId: string) => void;

interface PileViewerHotkeyStore {
  actionHandler: PileViewerActionHandler | null;
  setActionHandler: (handler: PileViewerActionHandler | null) => void;
}

export const usePileViewerHotkeyStore = create<PileViewerHotkeyStore>((set) => ({
  actionHandler: null,
  setActionHandler: (actionHandler) => set({ actionHandler }),
}));
