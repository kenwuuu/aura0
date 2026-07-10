import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { HandCard } from './HandCard';
import { Card } from '@/features/player';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useReflowSafeHover } from '@/shared/hooks/useReflowSafeHover';
import { CARD_HEIGHT } from '@/constants';

interface HandCardsContainerProps {
  yPlayerState: Y.Map<any>;
  playerId: string;
  zoomLevel: number;
  onHoveredCardChange: (cardId: string | null) => void;
  overrideCards?: Card[];
  /** Span the full viewport width (phone layout) instead of the centered
   * min(75vw, 950px) desktop strip. */
  fullWidth?: boolean;
}

function useYjsObserver<T>(yMap: Y.Map<any>, key: string, defaultValue: T): T {
  const [value, setValue] = useState<T>(() => yMap.get(key) ?? defaultValue);
  useEffect(() => {
    const observer = () => setValue(yMap.get(key) ?? defaultValue);
    yMap.observe(observer);
    observer();
    return () => yMap.unobserve(observer);
  }, [yMap, key, defaultValue]);
  return value;
}

export const HandCardsContainer: React.FC<HandCardsContainerProps> = ({
  yPlayerState,
  playerId,
  zoomLevel,
  onHoveredCardChange,
  overrideCards,
  fullWidth = false,
}) => {
  const hand = useYjsObserver<Card[]>(yPlayerState, 'hand', []);
  const displayHand = overrideCards && hand.length === 0 ? overrideCards : hand;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevHandLenRef = useRef(hand.length);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Scroll to the end when a card is added to hand.
  useEffect(() => {
    if (displayHand.length > prevHandLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        left: scrollRef.current.scrollWidth,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
    prevHandLenRef.current = displayHand.length;
  }, [displayHand.length, prefersReducedMotion]);

  const handleEnter = useCallback((cardId: string) => {
    onHoveredCardChange(cardId);
    const card = displayHand.find(c => c.id === cardId);
    if (card) {
      useCardPreviewStore.getState().show(card, {
        yMap: yPlayerState,
        isPresent: () => ((yPlayerState.get('hand') as Card[] | undefined) ?? []).some(c => c.id === cardId),
      });
    }
  }, [displayHand, onHoveredCardChange, yPlayerState]);

  const handleLeave = useCallback(() => {
    onHoveredCardChange(null);
    useCardPreviewStore.getState().hide();
  }, [onHoveredCardChange]);

  const handleMove = useCallback((x: number, y: number) => {
    useCardPreviewStore.getState().updatePosition(x, y);
  }, []);

  // A hotkey can move the hovered card out of the hand; the sibling that reflows
  // into its screen slot never fires a real mouseenter because the pointer itself
  // didn't move. useReflowSafeHover re-derives hover from the last known pointer
  // position so the next hotkey press lands on whatever card is now under the cursor.
  const { handleMouseEnter, handleMouseMove, handleMouseLeave } = useReflowSafeHover({
    presentIds: displayHand.map(c => c.id),
    onEnter: handleEnter,
    onLeave: handleLeave,
    onMove: handleMove,
  });

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // card-height * zoom + 20px headroom so the hover-lift (translateY(-12px)) never clips.
  // 3x multiplier matches hand-card in style.css. 3x because 1x is too small
  // don't want to have a default zoom level that's not 1.0x because it would confuse users
  const containerHeight = Math.ceil(3 * CARD_HEIGHT * zoomLevel) + 20;

  return (
    <div
      ref={scrollRef}
      className="hand-scroll"
      data-hand={playerId}
      data-testid="hand-cards-container"
      onWheel={handleWheel}
      style={{
        height: containerHeight,
        ...(fullWidth ? { width: '100%', maxWidth: '100%' } : { maxWidth: 'min(75vw, 950px)' }),
        ['--card-zoom' as string]: zoomLevel,
      }}
    >
      <SortableContext items={displayHand.map(c => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="hand-cards">
          {displayHand.map(card => (
            <HandCard
              key={card.id}
              card={card}
              onMouseEnter={handleMouseEnter}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};
