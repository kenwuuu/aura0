/**
 * GameDndProvider — the drag-and-drop layer shared by the real game (App) and
 * the board demo (DemoBoard). Owns the dnd-kit <DndContext>: pointer tracking,
 * sensors, the hand-card drag lifecycle (hand→board via playCardFromHand,
 * hand→pile, and in-hand reorder), and the drag overlay.
 *
 * Anything that renders a battlefield + FloatingHand needs this wrapper — the
 * board's drop target and the hand's draggables are inert without the handlers
 * here, so keep this the single home for that wiring rather than re-deriving it
 * per host.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { arrayMove } from '@dnd-kit/sortable';
import { coordinatesFromPointerEvent, coordinatesFromTouchMoveEvent } from './dragDropCoordinates';
import type { Player } from '@/features/player';
import type { Card, PileType } from '@/features/player/types';
import { playCardFromHand } from '@/features/battlefield/battlefieldActions';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useSettingsStore } from './stores/settingsStore';
import { DEFAULT_CARD_BACK } from '@/constants';

function CardDragOverlay({ card, zoom }: { card: Card; zoom: number }) {
  const imageUrl = card.isFlipped
    ? (card.images?.back?.normal ?? DEFAULT_CARD_BACK)
    : card.images?.front?.normal;
  return (
    <div style={{
      width: 63 * zoom, height: 88 * zoom,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
      background: '#2d2d2d',
      cursor: 'grabbing',
    }}>
      {imageUrl && (
        <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 2 }} />
      )}
    </div>
  );
}

export function GameDndProvider({
  player,
  playerId,
  children,
}: {
  player: Player;
  playerId: string;
  children: ReactNode;
}) {
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeZoom, setActiveZoom] = useState(1);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Track the live pointer position directly rather than deriving it from
  // dnd-kit's DragEndEvent (see dragDropCoordinates.ts for why). touchmove is
  // tracked explicitly, not just pointermove, so this stays correct even if a
  // browser doesn't synthesize pointer-compatibility events for a touch drag.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => { lastPointerRef.current = coordinatesFromPointerEvent(e); };
    const onTouchMove = (e: TouchEvent) => {
      const pos = coordinatesFromTouchMoveEvent(e);
      if (pos) lastPointerRef.current = pos;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Long-press to drag on touch: 300ms hold without moving > 5px starts the drag.
    // During the delay window dnd-kit does not call preventDefault, so the browser
    // can still scroll the hand horizontally on a quick swipe.
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const card = player.getState().hand.find(c => c.id === event.active.id);
    setActiveCard(card ?? null);
    setActiveZoom(useSettingsStore.getState().handZoom);
    useCardPreviewStore.getState().hide();
  }, [player]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    const cardId = active.id as string;

    if (over?.id === 'battlefield') {
      const { x, y } = lastPointerRef.current;
      playCardFromHand(cardId, x, y);
      return;
    }

    if (typeof over?.id === 'string' && over.id.startsWith('pile-')) {
      // id format: pile-{pileKind}-{ownerId}  (ownerId may contain hyphens)
      const withoutPrefix = over.id.slice('pile-'.length);
      const dashIdx = withoutPrefix.indexOf('-');
      const pileKind = withoutPrefix.slice(0, dashIdx) as Exclude<PileType, 'hand' | 'scry'>;
      const pileOwnerId = withoutPrefix.slice(dashIdx + 1);
      if (pileOwnerId !== playerId) return; // only local piles
      const card = player.getState().hand.find(c => c.id === cardId);
      if (!card) return;
      player.movePileCard(card, 'hand', pileKind);
      return;
    }

    if (over && over.id !== active.id) {
      // Reorder within hand
      const hand = player.getState().hand;
      const oldIndex = hand.findIndex(c => c.id === active.id);
      const newIndex = hand.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        player.reorderHand(arrayMove(hand, oldIndex, newIndex));
      }
    }
  }, [player, playerId]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeCard && <CardDragOverlay card={activeCard} zoom={activeZoom} />}
      </DragOverlay>
    </DndContext>
  );
}
