import * as Y from 'yjs';
import { Player } from '@/features/player';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import { PileType } from '@/features/game-dock/components';

/**
 * Handles drag-and-drop events between the whiteboard and other game zones.
 *
 * The hand→board and token→board drop logic now lives in BattlefieldCanvas.tsx.
 * This class only handles the reverse: cards dragged from the board back to the dock.
 */
export class WhiteboardEventHandlers {
  constructor(
    private yDoc: Y.Doc,
    private localPlayer: Player,
    private playerId: string,
    private onDeckChange: () => void,
  ) {}

  setupEventListeners(): void {
    this.setupBattlefieldToDockDrag();
  }

  private setupBattlefieldToDockDrag(): void {
    window.addEventListener('moveCardFromBattlefield', ((event: CustomEvent) => {
      const { cardId, destination } = event.detail;
      this.moveCardFromBattlefieldToPile(cardId, destination);
    }) as EventListener);
  }

  public moveCardFromBattlefieldToPile(cardId: string, destination: PileType) {
    const yCards = this.yDoc.getMap(YDOC_CARDS_ON_BOARD);
    const card = yCards.get(cardId) as any;

    if (!card || card.ownerId !== this.playerId) return;

    // Strip WhiteboardCard-specific fields to get base Card
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { zIndex, ownerId, ...baseCard } = card;

    if (destination === 'hand') {
      this.localPlayer.placeCardInPile(baseCard, 'hand');
    } else if (destination === 'exile') {
      this.localPlayer.placeCardInPile(baseCard as any, 'exile');
    } else if (destination === 'discard') {
      this.localPlayer.placeCardInPile(baseCard as any, 'discard');
    } else if (destination === 'deck') {
      this.localPlayer.moveCardToDeckTop(baseCard as any);
      this.onDeckChange();
    }

    yCards.delete(cardId);
  }

  destroy(): void {
    // Event listeners are not explicitly removed (no refs kept)
  }
}
