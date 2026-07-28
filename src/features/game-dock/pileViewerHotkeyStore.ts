/**
 * Pile-viewer hotkey bridge (Zustand)
 *
 * The pile-viewer move shortcuts live in the global hotkey layer
 * (`useAllGameHotkeys`), but the actual move depends on the *currently open*
 * pile viewer — its card list and its source-pile-bound callbacks live in the
 * React `PileViewerReact` component. This store is the seam between them:
 * the open viewer registers an `actionHandler`, and the hotkey layer invokes it.
 *
 * It also publishes *which* actions that viewer can perform, so the right-click
 * menu (`GameContextMenu`) can offer exactly the rows that will do something —
 * the same presence-driven rule that already decides the destination bar and
 * the desktop key legend, rather than a third hand-maintained list.
 *
 * Replaces the old `window.dispatchEvent('pileViewerCardAction')` bus.
 */

import { create } from 'zustand';

/** Applies `action` (moveToHand, moveToDiscard, …) to the card `cardId`. */
export type PileViewerActionHandler = (action: string, cardId: string) => void;

const NO_ACTIONS: ReadonlySet<string> = new Set();

interface PileViewerHotkeyStore {
  actionHandler: PileViewerActionHandler | null;
  /** Action ids the open viewer was given a callback for. Empty when no viewer
   *  is open, and for read-only viewers (an opponent's pile). */
  availableActions: ReadonlySet<string>;
  /** Register the open viewer. Passing `null` clears both fields together, so
   *  the handler and the advertised actions can never disagree. */
  setActionHandler: (
    handler: PileViewerActionHandler | null,
    availableActions?: ReadonlySet<string>,
  ) => void;
}

export const usePileViewerHotkeyStore = create<PileViewerHotkeyStore>((set) => ({
  actionHandler: null,
  availableActions: NO_ACTIONS,
  setActionHandler: (actionHandler, availableActions = NO_ACTIONS) =>
    set({ actionHandler, availableActions: actionHandler ? availableActions : NO_ACTIONS }),
}));
