// responsible for controlling state of any UI
// element, e.g. modals, tooltips, etc

import { create } from 'zustand';

interface TooltipStore {
  isTooltipOpen: boolean;
  setIsTooltipOpen: (isOpen: boolean) => void;
}

export const useTooltipStore = create<TooltipStore>((set) => ({
  isTooltipOpen: false,
  setIsTooltipOpen: (isOpen: boolean) => set({isTooltipOpen: isOpen}),
}))
