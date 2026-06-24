/**
 * Card preview popup + its zoom controls (replaces the imperative CardPreview class).
 *
 * Renders from `useCardPreviewStore`: a large hover preview of the active card
 * (flip-aware, mouse-following so it never sits under the cursor) plus a small
 * zoom-control cluster. Reuses the existing `.zoom-controls` / `.zoom-button`
 * styles from style.css to preserve the original appearance.
 */

import { DEFAULT_CARD_BACK } from '@/constants';
import type { Card } from '@/features/player/types';
import { useCardPreviewStore } from './cardPreviewStore';

const BASE_WIDTH = 500;
const BASE_HEIGHT = 698; // Magic card aspect ratio (~1.4:1)

function selectPreviewImage(card: Card): { src: string | null; alt: string } {
  if (card.isFlipped) {
    return {
      src: card.images?.back?.normal || DEFAULT_CARD_BACK,
      alt: 'Card Back',
    };
  }
  return {
    src: card.images?.front?.large || null,
    alt: card.name || `Card #${card.cardNumber}`,
  };
}

const zoomControlsStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '200px',
  left: '20px',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

function CardPreviewPopup() {
  const card = useCardPreviewStore((state) => state.card);
  const isVisible = useCardPreviewStore((state) => state.isVisible);
  const mouseX = useCardPreviewStore((state) => state.mouseX);
  const mouseY = useCardPreviewStore((state) => state.mouseY);
  const zoom = useCardPreviewStore((state) => state.zoom);

  if (!isVisible || !card) return null;

  const { src, alt } = selectPreviewImage(card);
  if (!src) return null;

  const width = BASE_WIDTH * zoom;
  const height = BASE_HEIGHT * zoom;

  // Flip the preview to the left side when the cursor sits where the card would cover it.
  const showOnLeft = mouseX > window.innerWidth - width * 1.1 && mouseY < height * 1.1;

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    left: showOnLeft ? '20px' : 'auto',
    right: showOnLeft ? 'auto' : '20px',
    width: `${width}px`,
    height: `${height}px`,
    zIndex: 10000,
    borderRadius: '12px',
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6)',
    border: '2px solid #4a4a4a',
    overflow: 'hidden',
    pointerEvents: 'none',
  };

  return (
    <div className="card-preview-popup" style={popupStyle}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}

function CardPreviewZoomControls() {
  const zoom = useCardPreviewStore((state) => state.zoom);
  const adjustZoom = useCardPreviewStore((state) => state.adjustZoom);
  const resetZoom = useCardPreviewStore((state) => state.resetZoom);

  return (
    <div className="zoom-controls card-preview-zoom-controls" style={zoomControlsStyle}>
      <button className="zoom-button" title="Zoom In Card Preview" onClick={() => adjustZoom(0.1)}>
        +
      </button>
      <button className="zoom-button zoom-display" title="Reset Card Preview Zoom" onClick={resetZoom}>
        {zoom.toFixed(1)}×
      </button>
      <button className="zoom-button" title="Zoom Out Card Preview" onClick={() => adjustZoom(-0.1)}>
        −
      </button>
    </div>
  );
}

export function CardPreview() {
  return (
    <>
      <CardPreviewPopup />
      <CardPreviewZoomControls />
    </>
  );
}