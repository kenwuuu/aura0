import { memo, useCallback } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { WhiteboardCard } from '../types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { wasLastInputTouch } from '@/shared/pointerInput';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useContextMenuTap } from '@/features/hotkeys/useContextMenuTap';
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
  const { yCards } = card;

  const face = resolveCardFace(card);

  // Show this card's preview at (x, y). Ungated — used both by desktop hover and
  // by the touch tap machine, which decides when a tap should preview.
  const showPreview = useCallback((x: number, y: number) => {
    useHotkeyStore.getState().setHoveredBattlefieldCard(id);
    const latestCard = yCards.get(id) || card;
    useCardPreviewStore.getState().show(latestCard, { yMap: yCards, isPresent: () => yCards.has(id) });
    useCardPreviewStore.getState().updatePosition(x, y);
  }, [id, yCards, card]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    // Inert on touch: the synthetic mouseenter from a tap would fight the
    // tap-driven preview (see pointerInput.ts). Taps own the preview instead.
    if (wasLastInputTouch()) return;
    showPreview(e.clientX, e.clientY);
  }, [showPreview]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Inert on touch, for the same reason as mouseenter above: a tap's compat
    // mouse sequence can hand the card a stray mouseleave, which would tear down
    // the preview the tap just raised and strand the two-tap machine on its
    // first step (it re-previews forever, never reaching the menu). Taps own the
    // preview on touch; the tap machine and the board/drag handlers dismiss it.
    if (wasLastInputTouch()) return;
    useHotkeyStore.getState().setHoveredBattlefieldCard(null);
    useCardPreviewStore.getState().hide();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().openMenu({
      target: { kind: 'battlefieldCard', id },
      x: e.clientX,
      y: e.clientY,
    });
  }, [id]);

  // On touch, a tap previews this card; a second tap on it opens the same
  // context menu right-click does on desktop (two-tap machine).
  const tapMenu = useContextMenuTap({ kind: 'battlefieldCard', id }, { showPreview });

  // tap + rotation transform
  const rotation = resolveCardRotation(card);
  const transform = rotation ? `rotate(${rotation}deg)` : undefined;

  return (
    <div
      data-testid="battlefield-card"
      data-card-id={id}
      style={{ ...CARD_STYLE, transform }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      {...tapMenu}
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
