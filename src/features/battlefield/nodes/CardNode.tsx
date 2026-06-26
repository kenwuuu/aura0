import { memo, useCallback } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { WhiteboardCard } from '../types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { executeBattlefieldCardAction } from '../battlefieldCardActions';
import { DEFAULT_CARD_BACK, CARD_WIDTH, CARD_HEIGHT } from '@/constants';

interface CardNodeData extends WhiteboardCard {
  yCards: Y.Map<WhiteboardCard>;
  localPlayerId: string;
}

export type CardNodeType = {
  id: string;
  type: 'card';
  position: { x: number; y: number };
  data: CardNodeData;
};

const CARD_STYLE = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  position: 'relative' as const,
  cursor: 'grab',
  userSelect: 'none' as const,
  backgroundColor: '#6a6a6a',
  borderRadius: 3.5,
  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
  padding: .5,
};

export const CardNode = memo(function CardNode({ data, id }: NodeProps) {
  const card = data as unknown as CardNodeData;
  const { yCards, localPlayerId } = card;

  const imageSrc = card.isFlipped
    ? (card.images?.back?.normal || DEFAULT_CARD_BACK)
    : (card.images?.front?.normal || null);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    useHotkeyStore.getState().setHoveredBattlefieldCard(id);
    const latestCard = yCards.get(id) || card;
    useCardPreviewStore.getState().show(latestCard);
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, [id, yCards, card]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    useHotkeyStore.getState().setHoveredBattlefieldCard(null);
    useCardPreviewStore.getState().hide();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useHotkeyMenuStore.getState().openMenu({
      cardId: id,
      context: HotkeyContext.Battlefield,
      x: e.clientX,
      y: e.clientY,
      onSelect: (hotkey) => executeBattlefieldCardAction(hotkey.action, id, yCards, localPlayerId),
    });
  }, [id, yCards, localPlayerId]);

  // tap + rotation transform
  const rotation = (card.rotation ?? 0) + (card.isTapped ? 90 : 0);
  const transform = rotation ? `rotate(${rotation}deg)` : undefined;

  return (
    <div
      style={{ ...CARD_STYLE, transform }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={card.isFlipped ? 'Card Back' : (card.name || `Card #${card.cardNumber}`)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block', borderRadius: 3 }}
          draggable={false}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          backgroundColor: card.isFlipped ? '#4a4a4a' : '#2d2d2d',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#888', fontSize: 11,
          borderRadius: 3,
        }}>
          #{card.cardNumber}
        </div>
      )}
    </div>
  );
});
