import { useCallback, useEffect, useState } from 'react';
import { PileViewerReact } from './components/PileViewerReact';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { playCardFromPile } from '@/features/battlefield/battlefieldActions';
import { usePileViewerOpenStore } from './pileViewerOpenStore';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import type { Card } from '@/features/player/types';

/**
 * Renders the local deck/exile/discard pile viewers, driven by
 * usePileViewerOpenStore (fired by board PileNodes on click). Each pile keeps
 * its own open/cards state — mirrors the three independent viewers this
 * replaced, so opening one doesn't implicitly close another.
 */
export function LocalPileTiles() {
  const player = useGameInstance((s) => s.player);
  const roomManager = useGameInstance((s) => s.roomManager);

  const [deckOpen, setDeckOpen] = useState(false);
  const [deckCards, setDeckCards] = useState<Card[]>([]);
  const [exileOpen, setExileOpen] = useState(false);
  const [exileCards, setExileCards] = useState<Card[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardCards, setDiscardCards] = useState<Card[]>([]);

  const viewPile = useCallback((pile: 'deck' | 'exile' | 'discard') => {
    if (!player) return;
    switch (pile) {
      case 'deck':
        setDeckCards(player.getDeckCards());
        setDeckOpen(true);
        break;
      case 'exile':
        setExileCards(player.getState().exilePile);
        setExileOpen(true);
        break;
      case 'discard':
        setDiscardCards(player.getState().discardPile);
        setDiscardOpen(true);
        break;
    }
  }, [player]);

  useEffect(() => {
    const unsub = usePileViewerOpenStore.subscribe((state) => {
      const req = state.request;
      if (!req || req.scope !== 'local') return;
      usePileViewerOpenStore.getState().clear();
      viewPile(req.pile);
    });
    return unsub;
  }, [viewPile]);

  return (
    <>
      <PileViewerReact
        isOpen={deckOpen}
        onClose={() => setDeckOpen(false)}
        cards={deckCards}
        pileType="deck"
        callbacks={{
          onPlayToBattlefield: (card) => {
            if (!player) return;
            player.removeCardFromPileById(card.id, 'deck');
            playCardFromPile(card);
            setDeckCards(player.getDeckCards());
          },
          onMoveToHand: (card) => {
            if (!player) return;
            player.movePileCard(card, 'deck', 'hand');
            setDeckCards(player.getDeckCards());
          },
          onMoveToDiscard: (card) => {
            if (!player) return;
            player.movePileCard(card, 'deck', 'discard');
            setDeckCards(player.getDeckCards());
          },
          onMoveToExile: (card) => {
            if (!player) return;
            player.movePileCard(card, 'deck', 'exile');
            setDeckCards(player.getDeckCards());
          },
          onMoveToDeckTop: (card) => {
            if (!player) return;
            player.movePileCard(card, 'deck', 'deck');
            setDeckCards(player.getDeckCards());
          },
          onMoveToDeckBottom: (card) => {
            if (!player) return;
            player.movePileCard(card, 'deck', 'deck', 0);
            setDeckCards(player.getDeckCards());
          },
          onShuffleDeck: () => {
            if (!player) return;
            player.shuffleDeck();
            if (roomManager) DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
          },
        }}
      />
      <PileViewerReact
        isOpen={exileOpen}
        onClose={() => setExileOpen(false)}
        cards={exileCards}
        pileType="exile"
        callbacks={{
          onPlayToBattlefield: (card) => {
            if (!player) return;
            player.removeCardFromPileById(card.id, 'exile');
            playCardFromPile(card);
            setExileCards(player.getState().exilePile);
          },
          onMoveToHand: (card) => {
            if (!player) return;
            player.movePileCard(card, 'exile', 'hand');
            setExileCards(player.getState().exilePile);
          },
          onMoveToDiscard: (card) => {
            if (!player) return;
            player.movePileCard(card, 'exile', 'discard');
            setExileCards(player.getState().exilePile);
          },
          onMoveToDeckTop: (card) => {
            if (!player) return;
            player.movePileCard(card, 'exile', 'deck');
            setExileCards(player.getState().exilePile);
          },
          onMoveToDeckBottom: (card) => {
            if (!player) return;
            player.movePileCard(card, 'exile', 'deck', 0);
            setExileCards(player.getState().exilePile);
          },
        }}
      />
      <PileViewerReact
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        cards={discardCards}
        pileType="discard"
        callbacks={{
          onPlayToBattlefield: (card) => {
            if (!player) return;
            player.removeCardFromPileById(card.id, 'discard');
            playCardFromPile(card);
            setDiscardCards(player.getState().discardPile);
          },
          onMoveToHand: (card) => {
            if (!player) return;
            player.movePileCard(card, 'discard', 'hand');
            setDiscardCards(player.getState().discardPile);
          },
          onMoveToExile: (card) => {
            if (!player) return;
            player.movePileCard(card, 'discard', 'exile');
            setDiscardCards(player.getState().discardPile);
          },
          onMoveToDeckTop: (card) => {
            if (!player) return;
            player.movePileCard(card, 'discard', 'deck');
            setDiscardCards(player.getState().discardPile);
          },
          onMoveToDeckBottom: (card) => {
            if (!player) return;
            player.movePileCard(card, 'discard', 'deck', 0);
            setDiscardCards(player.getState().discardPile);
          },
          onExileAll: () => {
            if (!player) return;
            player.exileAllDiscard();
            setDiscardCards(player.getState().discardPile);
          },
        }}
      />
    </>
  );
}
