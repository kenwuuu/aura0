import React, { useState, useEffect, useRef } from 'react';
import { ScryModal } from './ScryModal';
import { PileViewer } from './components/PileViewer';
import { useScryStore } from './scryStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { logAction } from '@/features/action-log/actionLog';

export function ScryManager() {
  const player = useGameInstance((s) => s.player);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const [isOpen, setIsOpen] = useState(false);
  const [maxCards, setMaxCards] = useState(0);
  const viewerRef = useRef<PileViewer | null>(null);

  // Lazy-init the PileViewer — must be stable across renders.
  const getViewer = (): PileViewer => {
    if (!viewerRef.current) {
      viewerRef.current = new PileViewer({
        onMoveToDiscard: (card) => {
          if (!player) return;
          player.removeCardFromPileById(card.id, 'scry');
          player.placeCardInPile(card, 'discard');
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
        onMoveToDeckTop: (card) => {
          if (!player) return;
          player.removeCardFromPileById(card.id, 'scry');
          player.placeCardInPile(card, 'deck');
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
        onMoveToDeckBottom: (card) => {
          if (!player) return;
          player.removeCardFromPileById(card.id, 'scry');
          player.placeCardInPile(card, 'deck', 0);
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
      });
    }
    return viewerRef.current;
  };

  useEffect(() => {
    const unsub = useScryStore.subscribe((state) => {
      if (!state.requested || !player) return;
      useScryStore.getState().consume();
      setMaxCards(player.getDeck().getCardCount());
      setIsOpen(true);
    });
    return unsub;
  }, [player]);

  useEffect(() => {
    const handleViewerClose = () => {
      if (!player) return;
      const scryPile = player.getScryPile();
      scryPile.getCards().forEach((card) => player.getDeck().addCardToTop(card));
      scryPile.clear();
    };
    window.addEventListener('scryViewer closing', handleViewerClose);
    return () => window.removeEventListener('scryViewer closing', handleViewerClose);
  }, [player]);

  const handleConfirm = (count: number) => {
    if (!player) return;
    setIsOpen(false);

    const deck = player.getDeck();
    const scryPile = player.getScryPile();
    scryPile.clear();

    const cards = [];
    for (let i = 0; i < count; i++) {
      const card = deck.drawCard();
      if (card) cards.unshift(card);
    }
    cards.forEach((card) => scryPile.addCardToTop(card));

    if (yDoc && playerId) {
      logAction(yDoc, { actorId: playerId, type: 'scry', text: `scried ${count} card${count === 1 ? '' : 's'}` });
    }

    getViewer().show(scryPile.getCards(), 'scry');
  };

  return (
    <ScryModal isOpen={isOpen} maxCards={maxCards} onConfirm={handleConfirm} onCancel={() => setIsOpen(false)} />
  );
}
