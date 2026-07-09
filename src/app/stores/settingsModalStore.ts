/**
 * Controls the Settings modal's open state from anywhere (gear icon, the
 * connection-status tooltip, etc.) without prop-drilling. Mirrors the
 * imperative-open pattern used by contextMenuStore.
 */
import { create } from 'zustand';

interface SettingsModalState {
  isOpen: boolean;
  initialSectionId?: string;
  open: (sectionId?: string) => void;
  close: () => void;
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  initialSectionId: undefined,
  open: (sectionId) => set({ isOpen: true, initialSectionId: sectionId }),
  close: () => set({ isOpen: false }),
}));
