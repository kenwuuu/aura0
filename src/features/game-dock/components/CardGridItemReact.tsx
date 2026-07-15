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
import {useCardPreviewStore} from "@/features/card-preview/cardPreviewStore";
import {wasLastInputTouch} from "@/shared/pointerInput";

/** Hold duration (ms) before a touch turns into a card preview instead of a tap. */
const LONG_PRESS_MS = 450;
/** Finger travel (px) that cancels a pending long-press (treated as a scroll). */
const LONG_PRESS_MOVE_CANCEL_PX = 10;

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
  /** Whether tapping/clicking this card toggles selection (false = read-only viewer). */
  selectable: boolean;
  /** Whether this card is currently in the selection. */
  selected: boolean;
  /** Toggle this card's membership in the selection. */
  onToggleSelect: (cardId: string) => void;
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
  selectable,
  selected,
  onToggleSelect,
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

  // Touch gesture state. In the pile viewer a tap = select (drives the
  // destination bar); a long-press = preview. Desktop keeps hover-preview +
  // right-click menu, so this machinery only engages for `pointerType: touch`.
  const touch = React.useRef({ x: 0, y: 0, longPressed: false, timer: null as number | null });
  const clearLongPress = () => {
    if (touch.current.timer !== null) {
      window.clearTimeout(touch.current.timer);
      touch.current.timer = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    touch.current.longPressed = false;
    touch.current.x = e.clientX;
    touch.current.y = e.clientY;
    clearLongPress();
    touch.current.timer = window.setTimeout(() => {
      touch.current.timer = null;
      touch.current.longPressed = true;
      // Face-down cards (deck/scry, reveal off) can't be previewed.
      if (!showFaceDown) showPreview(touch.current.x, touch.current.y);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || touch.current.timer === null) return;
    if (
      Math.abs(e.clientX - touch.current.x) > LONG_PRESS_MOVE_CANCEL_PX ||
      Math.abs(e.clientY - touch.current.y) > LONG_PRESS_MOVE_CANCEL_PX
    ) {
      clearLongPress(); // treat as a scroll, not a press
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    clearLongPress();
  };

  // Click fires for both mouse clicks and the tap that ends a touch. A tap that
  // became a long-press already showed the preview, so swallow its trailing
  // click instead of toggling selection.
  const handleClick = () => {
    if (touch.current.longPressed) {
      touch.current.longPressed = false;
      return;
    }
    if (selectable) onToggleSelect(card.id);
  };

  const hasFrontImage = frontImageUrl && !frontImageError;
  const hasBackImage = backImageUrl && !backImageError;
  const hasAnyImage = hasFrontImage || hasBackImage;

  return (
    <div
      ref={cardRef}
      className={`${styles.cardGridItem} ${selected ? styles.selected : ''}`}
      data-testid="pile-viewer-card"
      data-card-id={card.id}
      data-selected={selected}
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      {/* Selection check badge */}
      {selected && (
        <div className={styles.selectCheck} data-testid="pile-viewer-card-check">✓</div>
      )}
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
