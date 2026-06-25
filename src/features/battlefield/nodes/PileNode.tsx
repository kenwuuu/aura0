import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

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

  return (
    // nodrag: prevents react-flow from treating button clicks as drag starts
    // data-pile-type / data-pile-owner: picked up by BattlefieldCanvas.findPileType
    // so dragging a board card onto this node moves it off-board into the right pile
    <div
      className={`resource-pile ${pileKind}-pile nodrag`}
      data-pile-type={pileKind}
      data-pile-owner={ownerId}
      style={{ opacity: handDisabled ? 0.4 : 1, cursor: handDisabled ? 'default' : 'pointer' }}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pile-label">
        {PILE_LABELS[pileKind]}
        {isOpponentHand && !allowViewHand && ' 🔒'}
      </div>
      <div className="pile-count">{count}</div>
      {isLocal && pileKind === 'deck' && (
        <button
          className="draw-button"
          onClick={handleDraw}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Draw
        </button>
      )}
    </div>
  );
});
