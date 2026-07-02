import React, { memo, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { useDroppable } from '@dnd-kit/core';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { HotkeyTooltip } from '@/features/hotkeys/HotkeyTooltip';
import { isHandViewDisabled, resolvePileOpenRequest } from './pileNodeLogic';

export type PileKind = 'deck' | 'exile' | 'discard' | 'hand';

export interface PileNodeData {
  ownerId: string;
  isLocal: boolean;
  pileKind: PileKind;
  count: number;
  /** Relevant for opponent hand pile — gates display and opening. */
  allowViewHand: boolean;
  yDoc: Y.Doc;
}

const PILE_LABELS: Record<PileKind, string> = {
  deck: 'Deck',
  exile: 'Exile',
  discard: 'Discard',
  hand: 'Hand',
};

const HOTKEY_PILE_KINDS = new Set<PileKind>(['deck', 'exile', 'discard']);

export const PileNode = memo(function PileNode({ data }: NodeProps) {
  const d = data as unknown as PileNodeData;
  const { ownerId, isLocal, pileKind, count, allowViewHand } = d;

  const isHandPile = pileKind === 'hand';
  const isOpponentHand = isHandPile && !isLocal;
  const handDisabled = isHandViewDisabled({ isLocal, pileKind, allowViewHand });

  // Register as a dnd-kit droppable for hand cards dragged from the FloatingHand.
  // Only local non-hand piles accept drops; disabled elsewhere.
  const canReceiveDrop = isLocal && !isHandPile;
  const { setNodeRef, isOver } = useDroppable({
    id: `pile-${pileKind}-${ownerId}`,
    disabled: !canReceiveDrop,
  });

  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const request = resolvePileOpenRequest({ ownerId, isLocal, pileKind, allowViewHand });
    if (request) usePileViewerOpenStore.getState().open(request);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    setHovered(true);
    setMousePos({ x: e.clientX, y: e.clientY });
    if (isLocal && HOTKEY_PILE_KINDS.has(pileKind)) {
      useHotkeyStore.getState().setHoveredPile(pileKind as 'deck' | 'exile' | 'discard');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (isLocal && HOTKEY_PILE_KINDS.has(pileKind)) {
      useHotkeyStore.getState().setHoveredPile(null);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`resource-pile ${pileKind}-pile nodrag`}
      data-pile-type={pileKind}
      data-pile-owner={ownerId}
      style={{
        width: 63,
        height: 88,
        minWidth: 63,
        padding: '4px',
        gap: 2,
        borderRadius: 3,
        boxSizing: 'border-box',
        justifyContent: 'center',
        opacity: handDisabled ? 0.6 : 1,
        cursor: handDisabled ? 'default' : 'pointer',
        outline: isOver && canReceiveDrop ? '2px solid #60a5fa' : undefined,
      }}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="pile-label" style={{ fontSize: 8 }}>
        {PILE_LABELS[pileKind]}
        {isOpponentHand && !allowViewHand && ' 🔒'}
      </div>
      <div className="pile-count" style={{ fontSize: 22, lineHeight: 1 }}>{count}</div>
      {isLocal && pileKind === 'deck' && (
        <button
          className="draw-button"
          style={{ padding: '2px 6px', fontSize: 9, marginTop: 0 }}
          onClick={(e) => { e.stopPropagation(); useGameInstance.getState().player?.drawCard(); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Draw
        </button>
      )}
      {hovered && isLocal && HOTKEY_PILE_KINDS.has(pileKind) && (
        <HotkeyTooltip context={pileKind} mouseX={mousePos.x} mouseY={mousePos.y} />
      )}
    </div>
  );
});
