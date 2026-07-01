/**
 * tokenCardSearchStore
 *
 * Request/consume store for the "Token card" search modal. Pattern mirrors
 * scryStore and addCardModal — a fire-and-forget trigger so the toolbar
 * action can open the modal without a component ref.
 */

import { create } from 'zustand';

interface TokenCardSearchStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useTokenCardSearchStore = create<TokenCardSearchStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
