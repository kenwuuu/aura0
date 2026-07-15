/**
 * Card preview popup (replaces the imperative CardPreview class).
 *
 * Renders from `useCardPreviewStore` for position/visibility, and reads the
 * persisted zoom level from `useSettingsStore` (Settings modal > Display).
 * The old on-screen zoom +/− cluster has been removed — adjust preview size
 * in the Settings modal instead.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_CARD_BACK } from '@/constants';
import type { Card } from '@/features/player/types';
import { useCardPreviewStore } from './cardPreviewStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { shouldShowOnLeft } from './cardPreviewLogic';

const BASE_WIDTH = 300;
const BASE_HEIGHT = 419; // Magic card aspect ratio (~1.4:1)

function selectPreviewImage(card: Card): { src: string | null; alt: string } {
  if (card.isFlipped) {
    return {
      src: card.images?.back?.normal || DEFAULT_CARD_BACK,
      alt: 'Card Back',
    };
  }
  return {
    src: card.images?.front?.normal || null,
    alt: card.name || `Card #${card.cardNumber}`,
  };
}

function CardPreviewPopup() {
  const card = useCardPreviewStore((state) => state.card);
  const isVisible = useCardPreviewStore((state) => state.isVisible);
  const mouseX = useCardPreviewStore((state) => state.mouseX);
  const mouseY = useCardPreviewStore((state) => state.mouseY);
  const zoom = useSettingsStore((state) => state.previewZoom);

  if (!isVisible || !card) return null;

  const { src, alt } = selectPreviewImage(card);
  if (!src) return null;

  const width = BASE_WIDTH * zoom;
  const height = BASE_HEIGHT * zoom;

  const showOnLeft = shouldShowOnLeft(mouseX, mouseY, width, height, window.innerWidth);

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    top: '15%',
    left: showOnLeft ? '20px' : 'auto',
    right: showOnLeft ? 'auto' : '20px',
    width: `${width}px`,
    height: `${height}px`,
    // Above the modal layer (dialogs/overlays are z-10000): the preview can be
    // triggered from inside the full-screen pile viewer (touch long-press) and
    // must sit on top of it. Portaled to <body> below so it's a direct sibling
    // of Radix's dialog portal — a clean z-index comparison, not one across the
    // app-root/portal tree boundary.
    zIndex: 10001,
    borderRadius: `${24 * zoom}px`,
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6)',
    border: '2px solid #4a4a4a',
    overflow: 'hidden',
    pointerEvents: 'none',
  };

  return createPortal(
    <div className="card-preview-popup" style={popupStyle}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>,
    document.body,
  );
}

/**
 * Auto-dismisses the preview once the previewed card leaves the zone it was
 * hovered from (dragged to a pile, moved by a hotkey, moved from a pile-viewer
 * modal, etc.) — whatever mutates the watched Yjs map, not just hover-out.
 */
function CardPreviewWatcher() {
  const card = useCardPreviewStore((state) => state.card);
  const source = useCardPreviewStore((state) => state.source);

  useEffect(() => {
    if (!card || !source) return;

    const checkPresence = () => {
      if (!source.isPresent()) useCardPreviewStore.getState().hide();
    };

    checkPresence();
    source.yMap.observe(checkPresence);
    return () => source.yMap.unobserve(checkPresence);
  }, [card, source]);

  return null;
}

export function CardPreview() {
  return (
    <>
      <CardPreviewPopup />
      <CardPreviewWatcher />
    </>
  );
}
