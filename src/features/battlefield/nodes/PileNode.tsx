import React, { memo, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { HotkeyTooltip } from '@/features/hotkeys/HotkeyTooltip';

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

// PileKind values that map 1:1 to HotkeyContext values and support hotkey hints
const HOTKEY_PILE_KINDS = new Set<PileKind>(['deck', 'exile', 'discard']);

/**
 * PileNode — card-pile tile rendered on the board for each player.
 *
 * Reuses the dock's `.resource-pile` CSS classes for visual parity.
 * Sets `data-pile-type` and `data-pile-owner` so the BattlefieldCanvas
 * `findPileType` DOM-walk detects drops of board cards onto this tile.
 * Local deck also shows a Draw button.
 * Opponent hand tile is only interactive when allowViewHand is set.
 */
export const PileNode = memo(function PileNode({ data }: NodeProps) {
  const d = data as unknown as PileNodeData;
  const { ownerId, isLocal, pileKind, count, allowViewHand } = d;

  const isHandPile = pileKind === 'hand';
  const isOpponentHand = isHandPile && !isLocal;

  // Opponent hand: dim if sharing is not enabled
  const handDisabled = isOpponentHand && !allowViewHand;

  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (handDisabled) return;

    if (isLocal) {
      // Local piles: request dock's existing viewer via the open-store
      if (pileKind !== 'hand') {
        usePileViewerOpenStore.getState().open({ scope: 'local', pile: pileKind });
      }
    } else {
      // Opponent piles: request OpponentPileViewers to open read-only viewer
      if (pileKind === 'exile' || pileKind === 'discard' || pileKind === 'hand') {
        usePileViewerOpenStore.getState().open({ scope: 'opponent', playerId: ownerId, pile: pileKind });
      }
    }
  };

  const handleDraw = (e: React.MouseEvent) => {
    e.stopPropagation();
    useGameInstance.getState().player?.drawCard();
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

  // Hand→pile drag: hand cards are HTML-dragged via dataTransfer text/plain (card id)
  const handleDragOver = (e: React.DragEvent) => {
    if (!isLocal || isHandPile) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isLocal || isHandPile) return;
    e.preventDefault();
    e.stopPropagation();
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const p = useGameInstance.getState().player;
    if (!p) return;
    const card = p.getState().hand.find((c) => c.id === cardId);
    if (!card) return;
    p.removeCardFromHand(cardId);
    p.placeCardInPile(card, pileKind);
  };

  return (
    // nodrag: prevents react-flow from treating button clicks as drag starts
    // data-pile-type / data-pile-owner: picked up by BattlefieldCanvas.findPileType
    // so dragging a board card onto this node moves it off-board into the right pile
    <div
      className={`resource-pile ${pileKind}-pile nodrag`}
      data-pile-type={pileKind}
      data-pile-owner={ownerId}
      style={{
        width: 63,
        height: 88,
        minWidth: 63,
        padding: '4px',
        gap: 2,
        borderRadius: 8,
        boxSizing: 'border-box',
        justifyContent: 'center',
        opacity: handDisabled ? 0.4 : 1,
        cursor: handDisabled ? 'default' : 'pointer',
      }}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
          onClick={handleDraw}
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