import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/features/player';
import { DEFAULT_CARD_BACK } from '@/constants';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useContextMenuTap } from '@/features/hotkeys/useContextMenuTap';

interface HandCardProps {
  card: Card;
  onMouseEnter: (cardId: string) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export const HandCard: React.FC<HandCardProps> = ({ card, onMouseEnter, onMouseMove, onMouseLeave }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const imageUrl = card.isFlipped
    ? (card.images?.back?.normal ?? DEFAULT_CARD_BACK)
    : card.images?.front?.normal;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().openMenu({
      target: { kind: 'handCard', id: card.id },
      x: e.clientX,
      y: e.clientY,
    });
  };

  // On touch, a tap opens the context menu. dnd-kit's PointerSensor owns
  // `onPointerDown` (drag activation), so compose it with the tap detector's —
  // a small tap opens the menu; travel past the drag threshold reorders the
  // hand instead.
  const tapMenu = useContextMenuTap({ kind: 'handCard', id: card.id });
  const onPointerDown = (e: React.PointerEvent) => {
    listeners?.onPointerDown?.(e);
    tapMenu.onPointerDown(e);
  };

  return (
    <div
      ref={setNodeRef}
      className="hand-card"
      data-testid="hand-card"
      data-card-id={card.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      {...listeners}
      {...attributes}
      onPointerDown={onPointerDown}
      onPointerUp={tapMenu.onPointerUp}
      onPointerCancel={tapMenu.onPointerCancel}
      onClickCapture={tapMenu.onClickCapture}
      onMouseEnter={() => onMouseEnter(card.id)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={card.isFlipped ? 'Card Back' : (card.name || `Card #${card.cardNumber}`)}
          className="hand-card-image"
        />
      ) : (
        <span className="card-number-badge">#{card.cardNumber}</span>
      )}
    </div>
  );
};
