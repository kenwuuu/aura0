/**
 * Card zoom controls for the battlefield (replaces the imperative ZoomController UI).
 * Reads/writes zoom state from `useZoomStore`; reuses the existing `.zoom-controls`
 * / `.zoom-button` styles from style.css to preserve the original appearance.
 */

import { useZoomStore } from './zoomStore';

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '200px',
  right: '20px',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export function ZoomControls() {
  const zoomLevel = useZoomStore((state) => state.zoomLevel);
  const adjustZoom = useZoomStore((state) => state.adjustZoom);
  const resetZoom = useZoomStore((state) => state.resetZoom);

  return (
    <div className="zoom-controls" style={containerStyle}>
      <button className="zoom-button" title="Zoom In Cards" onClick={() => adjustZoom(0.1)}>
        +
      </button>
      <button className="zoom-button zoom-display" title="Reset Zoom" onClick={resetZoom}>
        {zoomLevel.toFixed(1)}×
      </button>
      <button className="zoom-button" title="Zoom Out Cards" onClick={() => adjustZoom(-0.1)}>
        −
      </button>
    </div>
  );
}