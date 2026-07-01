import { create } from 'zustand';

interface SurveilStore {
  requested: boolean;
  request: () => void;
  consume: () => void;
}

export const useSurveilStore = create<SurveilStore>((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  consume: () => set({ requested: false }),
}));
