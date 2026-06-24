/**
 * Battlefield card zoom state.
 *
 * Replaces the imperative ZoomController. Holds the zoom level for cards on the
 * board, persisted to localStorage (key `whiteboard-zoom`). The React
 * `ZoomControls` component reads/writes this store; the still-imperative
 * `MultiPlayerBoardManager` reads it via `getState()` and reacts to changes via
 * `subscribe()`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

const clampZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

interface ZoomStore {
  zoomLevel: number;
  setZoom: (zoom: number) => void;
  adjustZoom: (delta: number) => void;
  resetZoom: () => void;
}

export const useZoomStore = create<ZoomStore>()(
  persist(
    (set, get) => ({
      zoomLevel: 1,
      setZoom: (zoom) => set({ zoomLevel: clampZoom(zoom) }),
      adjustZoom: (delta) => set({ zoomLevel: clampZoom(get().zoomLevel + delta) }),
      resetZoom: () => set({ zoomLevel: 1 }),
    }),
    { name: 'whiteboard-zoom' }
  )
);