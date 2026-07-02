import { memo, useCallback } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { WhiteboardCard } from '../types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { executeBattlefieldCardAction } from '../battlefieldCardActions';
import { resolveCardFace, resolveCardRotation } from './cardNodeLogic';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';

interface CardNodeData extends WhiteboardCard {
  yCards: Y.Map<WhiteboardCard>;
  yTokens: Y.Map<KeywordToken>;
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
  const { yCards, yTokens, localPlayerId } = card;

  const face = resolveCardFace(card);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    useHotkeyStore.getState().setHoveredBattlefieldCard(id);
    const latestCard = yCards.get(id) || card;
    useCardPreviewStore.getState().show(latestCard, { yMap: yCards, isPresent: () => yCards.has(id) });
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
      onSelect: (hotkey) => executeBattlefieldCardAction(hotkey.action, id, yCards, yTokens, localPlayerId),
    });
  }, [id, yCards, localPlayerId]);

  // tap + rotation transform
  const rotation = resolveCardRotation(card);
  const transform = rotation ? `rotate(${rotation}deg)` : undefined;

  return (
    <div
      style={{ ...CARD_STYLE, transform }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {face.src ? (
        <img
          src={face.src}
          alt={face.alt}
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
