import React from 'react';
import { Card } from '@/features/player/types';

interface CardPreviewProps {
  card: Card | null;
  isVisible: boolean;
}

export const CardPreview: React.FC<CardPreviewProps> = ({ card, isVisible }) => {
  // Don't render if not visible or no card image
  if (!isVisible || !card?.images?.front?.normal) {
    return null;
  }

  const previewStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '500px',
    height: '698px', // Maintain Magic card aspect ratio (~1.4:1)
    zIndex: 10000,
    borderRadius: '12px',
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6)',
    border: '2px solid #4a4a4a',
    overflow: 'hidden',
    pointerEvents: 'none',
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div className="card-preview-popup" style={previewStyle}>
      <img
        src={card.images.front.normal}
        alt={card.name || `Card #${card.cardNumber}`}
        style={imgStyle}
      />
    </div>
  );
};