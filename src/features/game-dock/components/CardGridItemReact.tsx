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
import type * as Y from 'yjs';
import {Card, PileType} from '@/features/player';
import {HotkeyContext} from '@/features/hotkeys/hotkeys';
import {DEFAULT_CARD_BACK, YSTATE_HAND, YSTATE_DECK, YSTATE_EXILE_PILE, YSTATE_DISCARD_PILE, YSTATE_SCRY, YSTATE_SIDEBOARD} from '@/constants';
import styles from './CardGridItemReact.module.css';
import {useContextMenuStore} from "@/features/hotkeys/contextMenuStore";
import {useContextMenuTap} from "@/features/hotkeys/useContextMenuTap";
import {useCardPreviewStore} from "@/features/card-preview/cardPreviewStore";
import {wasLastInputTouch} from "@/shared/pointerInput";

const PILE_YSTATE_KEY: Record<PileType, string> = {
  hand: YSTATE_HAND,
  deck: YSTATE_DECK,
  exile: YSTATE_EXILE_PILE,
  discard: YSTATE_DISCARD_PILE,
  scry: YSTATE_SCRY,
  sideboard: YSTATE_SIDEBOARD,
};

export interface CardGridItemReactProps {
  card: Card;
  position: number;
  showPosition: boolean;
  positionPrefix: string;
  showFaceDown: boolean;
  onHover: (card: Card | null) => void;
  hotkeyContext: HotkeyContext;
  pileType: PileType;
  yPlayerState: Y.Map<any> | null;
}

export const CardGridItemReact = React.memo(function CardGridItemReact({
  card,
  position,
  showPosition,
  positionPrefix,
  showFaceDown,
  onHover,
  hotkeyContext,
  pileType,
  yPlayerState,
}: CardGridItemReactProps) {
  const [frontImageLoaded, setFrontImageLoaded] = React.useState(false);
  const [backImageLoaded, setBackImageLoaded] = React.useState(false);
  const [frontImageError, setFrontImageError] = React.useState(false);
  const [backImageError, setBackImageError] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const frontImageUrl = card.images?.front?.normal || card.images?.front?.small;
  const backImageUrl = DEFAULT_CARD_BACK;

  // Show this card's preview at (x, y). Ungated — used both by desktop hover and
  // by the touch tap machine. Face-down cards (deck/scry) are never previewable,
  // so callers gate that separately (see the tap wiring below).
  const showPreview = (x: number, y: number) => {
    onHover(card);
    const cardId = card.id;
    const yStateKey = PILE_YSTATE_KEY[pileType];
    const source = yPlayerState
      ? {
          yMap: yPlayerState,
          isPresent: () => ((yPlayerState.get(yStateKey) as Card[] | undefined) ?? []).some(c => c.id === cardId),
        }
      : undefined;
    useCardPreviewStore.getState().show(card, source);
    useCardPreviewStore.getState().updatePosition(x, y);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Inert on touch: taps drive the preview (see pointerInput.ts).
    if (wasLastInputTouch()) return;
    onHover(card);
    if (showFaceDown) return;
    showPreview(e.clientX, e.clientY);
  };

  const handleMouseLeave = () => {
    if (wasLastInputTouch()) return;
    onHover(null);
    useCardPreviewStore.getState().hide();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    useContextMenuStore.getState().openMenu({
      target: { kind: 'pileViewerCard', id: card.id, context: hotkeyContext },
      x: e.clientX,
      y: e.clientY,
    });
  };

  // On touch, a face-up card previews on first tap and opens its menu on the
  // second (two-tap machine). Face-down cards can't be previewed, so they pass
  // no showPreview and keep the single-tap → menu behaviour.
  const tapMenu = useContextMenuTap(
    { kind: 'pileViewerCard', id: card.id, context: hotkeyContext },
    showFaceDown ? undefined : { showPreview },
  );

  const hasFrontImage = frontImageUrl && !frontImageError;
  const hasBackImage = backImageUrl && !backImageError;
  const hasAnyImage = hasFrontImage || hasBackImage;

  return (
    <div
      ref={cardRef}
      className={styles.cardGridItem}
      data-testid="pile-viewer-card"
      data-card-id={card.id}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      {...tapMenu}
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
