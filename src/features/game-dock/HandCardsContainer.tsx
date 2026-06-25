import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { HandCard } from './HandCard';
import { Card } from '@/features/player';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';

interface HandCardsContainerProps {
  yPlayerState: Y.Map<any>;
  playerId: string;
  zoomLevel: number;
  onHoveredCardChange: (cardId: string | null) => void;
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
}) => {
  const hand = useYjsObserver<Card[]>(yPlayerState, 'hand', []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevHandLenRef = useRef(hand.length);

  // Scroll to the end when a card is added to hand.
  useEffect(() => {
    if (hand.length > prevHandLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
    }
    prevHandLenRef.current = hand.length;
  }, [hand.length]);

  const handleMouseEnter = useCallback((cardId: string) => {
    onHoveredCardChange(cardId);
    const card = hand.find(c => c.id === cardId);
    if (card) useCardPreviewStore.getState().show(card);
  }, [hand, onHoveredCardChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    onHoveredCardChange(null);
    useCardPreviewStore.getState().hide();
  }, [onHoveredCardChange]);

  // card-height * zoom + 20px headroom so the hover-lift (translateY(-12px)) never clips.
  const containerHeight = Math.ceil(88 * zoomLevel) + 20;

  return (
    <div
      ref={scrollRef}
      className="hand-scroll"
      data-hand={playerId}
      style={{
        height: containerHeight,
        maxWidth: 'min(75vw, 950px)',
        ['--card-zoom' as string]: zoomLevel,
      }}
    >
      <SortableContext items={hand.map(c => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="hand-cards">
          {hand.map(card => (
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
