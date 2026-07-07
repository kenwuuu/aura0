/**
 * CardGrid Component
 *
 * Displays a grid of cards with drag-and-drop reordering support via dnd-kit.
 * Extracted from PileViewerReact to enable sortable functionality.
 *
 * Features:
 * - Drag-and-drop reordering for deck, exile, and discard piles
 * - Smooth animations for insertions/deletions
 * - Lazy loading with skeleton placeholders
 * - Static position labels during drag operations
 * - Automatic Yjs sync on reorder
 */

import * as React from 'react';
import * as Y from 'yjs';
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, PileType } from '@/features/player';
import { HotkeyContext, Hotkey } from '@/features/hotkeys/hotkeys';
import { CardGridItemReact } from './CardGridItemReact';
import { SortableCardGridItem } from './SortableCardGridItem';
import { useReflowSafeHover } from '@/shared/hooks/useReflowSafeHover';
import styles from './PileViewerReact.module.css';

export interface CardGridProps {
  cards: Card[];
  pileType: PileType;
  yPlayerState: Y.Map<any> | null;
  visibleCardCount: number;
  revealAll: boolean;
  revealCount: number;
  onCardReorder?: (reorderedCards: Card[]) => void;
  onHover: (card: Card | null) => void;
  hotkeyContext: HotkeyContext;
  onMenuSelect: (hotkey: Hotkey, cardId: string) => void;
  enableReordering?: boolean;
}

/**
 * Measuring configuration for dnd-kit to enable insert/delete animations.
 * Uses MeasuringStrategy.Always to continuously measure droppable dimensions.
 */
const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

export const CardGrid = React.memo(function CardGrid({
  cards,
  pileType,
  yPlayerState,
  visibleCardCount,
  revealAll,
  revealCount,
  onCardReorder,
  onHover,
  hotkeyContext,
  onMenuSelect,
  enableReordering = false,
}: CardGridProps) {
  const [localCards, setLocalCards] = React.useState(cards);

  // Sync local cards when prop changes
  React.useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  // Reflow-safe hover, keyed off `localCards` — not the `cards` prop. `localCards`
  // is what this component actually renders; it lags `cards` by one render after
  // a reorder or a card leaving the pile (see the sync effect above), so resyncing
  // off the prop directly can fire against a DOM that hasn't caught up yet.
  const { handleMouseEnter: trackHoverEnter, handleMouseMove, handleMouseLeave: trackHoverLeave } = useReflowSafeHover({
    presentIds: localCards.map((c) => c.id),
    onEnter: (cardId) => onHover(localCards.find((c) => c.id === cardId) ?? null),
    onLeave: () => onHover(null),
  });

  // CardGridItemReact reports hover by card object; translate to the id-based hook.
  const handleItemHover = React.useCallback((card: Card | null) => {
    if (card) trackHoverEnter(card.id); else trackHoverLeave();
  }, [trackHoverEnter, trackHoverLeave]);

  // Configure sensors for drag interactions
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8, // 8px movement required before drag starts (prevents accidental drags)
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200, // 200ms hold required for touch devices
      tolerance: 8,
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = localCards.findIndex((card) => card.id === active.id);
    const newIndex = localCards.findIndex((card) => card.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localCards, oldIndex, newIndex);
    setLocalCards(reordered);
    onCardReorder?.(reordered);
  };

  const renderingComplete = visibleCardCount >= localCards.length;

  // If reordering is disabled, render static grid
  if (!enableReordering) {
    return (
      <div
        className="deck-pile-viewer-grid grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4"
        data-rendering-complete={renderingComplete}
        data-rendered-count={visibleCardCount}
        data-cards-total={localCards.length}
        onMouseMove={handleMouseMove}
      >
        {localCards.map((card, index) => {
          // Position is just the index (cards are already sorted by parent component)
          const absoluteIndex = index;
          const shouldShowFaceDown =
            !revealAll && (revealCount === 0 || absoluteIndex >= revealCount);

          // Only render actual card if it's within visible batch
          if (index < visibleCardCount) {
            return (
              <CardGridItemReact
                key={card.id}
                card={card}
                position={absoluteIndex}
                showPosition={true}
                positionPrefix="Top"
                showFaceDown={shouldShowFaceDown}
                onHover={handleItemHover}
                hotkeyContext={hotkeyContext}
                onMenuSelect={onMenuSelect}
                pileType={pileType}
                yPlayerState={yPlayerState}
              />
            );
          }

          // Show skeleton for cards not yet mounted
          return (
            <div key={card.id} className={`card-grid-item ${styles.skeleton}`}>
              <div className="card-grid-item-image">
                <div className={styles.shimmer}></div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render sortable grid with dnd-kit
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      measuring={measuringConfig}
    >
      <SortableContext items={localCards.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div
          className="deck-pile-viewer-grid grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4"
          data-rendering-complete={renderingComplete}
          data-rendered-count={visibleCardCount}
          data-cards-total={localCards.length}
          onMouseMove={handleMouseMove}
        >
          {localCards.map((card, index) => {
            // Position is just the index (cards are already sorted by parent component)
            const absoluteIndex = index;
            const shouldShowFaceDown =
              !revealAll && (revealCount === 0 || absoluteIndex >= revealCount);

            // Only render actual card if it's within visible batch
            if (index < visibleCardCount) {
              return (
                <SortableCardGridItem
                  key={card.id}
                  id={card.id}
                  card={card}
                  position={absoluteIndex}
                  showPosition={true}
                  positionPrefix="Top"
                  showFaceDown={shouldShowFaceDown}
                  onHover={handleItemHover}
                  hotkeyContext={hotkeyContext}
                  onMenuSelect={onMenuSelect}
                  pileType={pileType}
                  yPlayerState={yPlayerState}
                />
              );
            }

            // Show skeleton for cards not yet mounted
            return (
              <div key={card.id} className={`card-grid-item ${styles.skeleton}`}>
                <div className="card-grid-item-image">
                  <div className={styles.shimmer}></div>
                </div>
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
});
