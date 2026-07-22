/**
 * Mobile token-tray open state.
 *
 * A request-based seam (like `pileViewerOpenStore`) so the "Create counter" menu
 * item — which lives inside a transient dropdown that unmounts the moment it's
 * selected — can hand off to the tray, which is mounted once at the app root
 * (`MobileTokenTray`) and survives the menu closing. Phone-only: the desktop
 * flow keeps its drag-from-popover grid.
 */
import { create } from 'zustand';

interface TokenTrayStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useTokenTrayStore = create<TokenTrayStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
