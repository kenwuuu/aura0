import { create } from 'zustand';

interface ScryStore {
  requested: boolean;
  request: () => void;
  consume: () => void;
}

export const useScryStore = create<ScryStore>((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  consume: () => set({ requested: false }),
}));
