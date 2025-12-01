// responsible for controlling state of any UI
// element, e.g. modals, tooltips, etc

import { create } from 'zustand';
import {TooltipManager} from "@/modules/whiteboard/TooltipManager";

interface TooltipStore {
  tooltipManager: TooltipManager;
  isTooltipOpen: boolean;
  setIsTooltipOpen: (isOpen: boolean) => void;
}

export const useTooltipStore = create<TooltipStore>((set) => ({
  tooltipManager: new TooltipManager(),
  isTooltipOpen: false,
  setIsTooltipOpen: (isOpen: boolean) => set({isTooltipOpen: isOpen}),
}))
