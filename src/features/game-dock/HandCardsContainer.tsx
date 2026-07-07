import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { HandCard } from './HandCard';
import { Card } from '@/features/player';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { CARD_HEIGHT } from '@/constants';

interface HandCardsContainerProps {
  yPlayerState: Y.Map<any>;
  playerId: string;
  zoomLevel: number;
  onHoveredCardChange: (cardId: string | null) => void;
  overrideCards?: Card[];
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

  const hoveredCardIdRef = useRef<string | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseEnter = useCallback((cardId: string) => {
    hoveredCardIdRef.current = cardId;
    onHoveredCardChange(cardId);
    const card = displayHand.find(c => c.id === cardId);
    if (card) {
      useCardPreviewStore.getState().show(card, {
        yMap: yPlayerState,
        isPresent: () => ((yPlayerState.get('hand') as Card[] | undefined) ?? []).some(c => c.id === cardId),
      });
    }
  }, [displayHand, onHoveredCardChange, yPlayerState]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoveredCardIdRef.current = null;
    onHoveredCardChange(null);
    useCardPreviewStore.getState().hide();
  }, [onHoveredCardChange]);

  // A hotkey can move the hovered card out of the hand; the sibling that reflows
  // into its screen slot never fires a real mouseenter because the pointer itself
  // didn't move. Re-derive hover from the last known pointer position so the next
  // hotkey press lands on whatever card is now under the cursor.
  useEffect(() => {
    const hoveredId = hoveredCardIdRef.current;
    if (!hoveredId || displayHand.some(c => c.id === hoveredId)) return;
    const pos = lastMousePosRef.current;
    const el = pos ? document.elementFromPoint(pos.x, pos.y) : null;
    const nextCardId = el instanceof Element ? el.closest<HTMLElement>('[data-card-id]')?.dataset.cardId : undefined;
    if (nextCardId) {
      handleMouseEnter(nextCardId);
    } else {
      handleMouseLeave();
    }
  }, [displayHand, handleMouseEnter, handleMouseLeave]);

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
        maxWidth: 'min(75vw, 950px)',
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
