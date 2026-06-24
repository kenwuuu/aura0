/**
 * CardGridItemReact Component
 *
 * Displays a single card in a grid layout with:
 * - Image loading with lazy loading and fallback
 * - Position label (e.g., "Top 1", "Top 2")
 * - Card name display
 * - Hover interactions with tooltip manager
 * - Keyboard navigation support
 */

import * as React from 'react';
import {Card} from '@/features/player';
import {HotkeyContext, Hotkey} from '@/features/hotkeys/hotkeys';
import {DEFAULT_CARD_BACK} from '@/constants';
import styles from './CardGridItemReact.module.css';
import {useHotkeyMenuStore} from "@/features/hotkeys/hotkeyMenuStore";
import {useCardPreviewStore} from "@/features/card-preview/cardPreviewStore";

export interface CardGridItemReactProps {
  card: Card;
  position: number;
  showPosition: boolean;
  positionPrefix: string;
  showFaceDown: boolean;
  onHover: (card: Card | null) => void;
  hotkeyContext: HotkeyContext;
  onMenuSelect: (hotkey: Hotkey, cardId: string) => void;
}

export const CardGridItemReact = React.memo(function CardGridItemReact({
  card,
  position,
  showPosition,
  positionPrefix,
  showFaceDown,
  onHover,
  hotkeyContext,
  onMenuSelect,
}: CardGridItemReactProps) {
  const [frontImageLoaded, setFrontImageLoaded] = React.useState(false);
  const [backImageLoaded, setBackImageLoaded] = React.useState(false);
  const [frontImageError, setFrontImageError] = React.useState(false);
  const [backImageError, setBackImageError] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const frontImageUrl = card.images?.front?.normal || card.images?.front?.small;
  const backImageUrl = DEFAULT_CARD_BACK;

  const handleMouseEnter = () => {
    onHover(card);
    if (!showFaceDown) useCardPreviewStore.getState().show(card);
  };

  const handleMouseLeave = () => {
    onHover(null);
    useCardPreviewStore.getState().hide();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    useHotkeyMenuStore.getState().openMenu({
      cardId: card.id,
      context: hotkeyContext,
      x: e.clientX,
      y: e.clientY,
      onSelect: onMenuSelect,
    });
  };

  const hasFrontImage = frontImageUrl && !frontImageError;
  const hasBackImage = backImageUrl && !backImageError;
  const hasAnyImage = hasFrontImage || hasBackImage;

  return (
    <div
      ref={cardRef}
      className={styles.cardGridItem}
      data-card-id={card.id}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* Card Image */}
      <div className={styles.cardGridItemImage}>
        {hasAnyImage ? (
          <div className={styles.cardImageContainer}>
            {/* Front Image */}
            {hasFrontImage && (
              <img
                src={frontImageUrl}
                alt={card.name || `Card #${card.cardNumber}`}
                className={`${styles.cardGridItemImg} ${styles.cardFrontImage} ${
                  frontImageLoaded ? styles.loaded : ''
                } ${showFaceDown ? styles.hidden : ''}`}
                loading="lazy"
                onLoad={() => setFrontImageLoaded(true)}
                onError={() => setFrontImageError(true)}
              />
            )}

            {/* Back Image */}
            {hasBackImage && (
              <img
                src={backImageUrl}
                alt="Card Back"
                className={`${styles.cardGridItemImg} ${styles.cardBackImage} ${
                  backImageLoaded ? styles.loaded : ''
                } ${!showFaceDown ? styles.hidden : ''}`}
                loading="lazy"
                onLoad={() => setBackImageLoaded(true)}
                onError={() => setBackImageError(true)}
              />
            )}
          </div>
        ) : (
          <div className={styles.cardGridItemFallback}>#{card.cardNumber}</div>
        )}
      </div>

      {/* Card Name */}
      {card.name && !showFaceDown && (
        <div className={styles.cardGridItemName}>{card.name}</div>
      )}

      {/* Position Label */}
      {showPosition && (
        <div className={styles.cardGridItemPosition}>
          {positionPrefix} {position + 1}
        </div>
      )}
    </div>
  );
});
