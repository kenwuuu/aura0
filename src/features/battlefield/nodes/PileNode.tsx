import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { useDroppable } from '@dnd-kit/core';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useContextMenuTap } from '@/features/hotkeys/useContextMenuTap';
import type { MenuTarget } from '@/features/hotkeys/hotkeys';
import { isPileViewDisabled, resolvePileOpenRequest } from './pileNodeLogic';
import type { PileType } from '@/features/player';

export interface PileNodeData {
  ownerId: string;
  isLocal: boolean;
  pileKind: Exclude<PileType, 'scry'>;
  count: number;
  /** Relevant for opponent hand pile — gates display and opening. */
  allowViewHand: boolean;
  yDoc: Y.Doc;
}

const PILE_LABELS: Record<Exclude<PileType, 'scry'>, string> = {
  deck: 'Deck',
  exile: 'Exile',
  discard: 'Discard',
  hand: 'Hand',
  sideboard: 'Sideboard',
};

const HOTKEY_PILE_KINDS = new Set<PileType>(['deck', 'exile', 'discard', 'sideboard']);

export const PileNode = memo(function PileNode({ data }: NodeProps) {
  const d = data as unknown as PileNodeData;
  const { ownerId, isLocal, pileKind, count, allowViewHand } = d;

  const isHandPile = pileKind === 'hand';
  const viewDisabled = isPileViewDisabled({ isLocal, pileKind, allowViewHand });
  // Opponents see the count of a private pile but never its contents — mark it.
  const isLockedOpponentPile = viewDisabled;

  // Register as a dnd-kit droppable for hand cards dragged from the FloatingHand.
  // Only local non-hand piles accept drops; disabled elsewhere.
  const canReceiveDrop = isLocal && !isHandPile;
  const { setNodeRef, isOver } = useDroppable({
    id: `pile-${pileKind}-${ownerId}`,
    disabled: !canReceiveDrop,
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const request = resolvePileOpenRequest({ ownerId, isLocal, pileKind, allowViewHand });
    if (request) usePileViewerOpenStore.getState().open(request);
  };

  const handleMouseEnter = () => {
    if (isLocal && HOTKEY_PILE_KINDS.has(pileKind)) {
      useHotkeyStore.getState().setHoveredPile(pileKind);
    }
  };

  const handleMouseLeave = () => {
    if (isLocal && HOTKEY_PILE_KINDS.has(pileKind)) {
      useHotkeyStore.getState().setHoveredPile(null);
    }
  };

  // Only local deck/exile/discard/sideboard piles carry a menu. Opponent piles
  // get a null target, so on touch the tap detector opts out and `handleClick`
  // runs as usual — a tap opens their viewer, the only thing they support.
  const pileMenuTarget: MenuTarget | null =
    isLocal && HOTKEY_PILE_KINDS.has(pileKind)
      ? { kind: 'pile', pileType: pileKind as 'deck' | 'exile' | 'discard' | 'sideboard' }
      : null;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pileMenuTarget) return;
    useContextMenuStore.getState().openMenu({
      target: pileMenuTarget,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // On touch, a tap opens the menu (which now carries a "View" row); the
  // synthesised click that would otherwise open the viewer is swallowed.
  const tapMenu = useContextMenuTap(pileMenuTarget);
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    tapMenu.onPointerDown(e);
  };

  return (
    <div
      ref={setNodeRef}
      className={`resource-pile ${pileKind}-pile nodrag`}
      data-testid="pile"
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
        opacity: viewDisabled ? 0.6 : 1,
        cursor: viewDisabled ? 'default' : 'pointer',
        outline: isOver && canReceiveDrop ? '2px solid #60a5fa' : undefined,
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={tapMenu.onPointerUp}
      onPointerCancel={tapMenu.onPointerCancel}
      onClickCapture={tapMenu.onClickCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      <div className="pile-label" style={{ fontSize: 8 }}>
        {PILE_LABELS[pileKind]}
        {isLockedOpponentPile && ' 🔒'}
      </div>
      <div className="pile-count" data-pile-count={count} style={{ fontSize: 22, lineHeight: 1 }}>{count}</div>
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
    </div>
  );
});
