import { useState, useEffect } from 'react';
import { PileViewerReact } from './components/PileViewerReact';
import { useScryStore } from './scryStore';
import { useSurveilStore } from './surveilStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { logAction } from '@/features/action-log/actionLog';
import { useNumberPromptStore } from '@/features/game-actions/numberPromptStore';
import type { Card } from '@/features/player/types';

export function ScryManager() {
  const player = useGameInstance((s) => s.player);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);

  const [isOpen, setIsOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);

  const openPromptFor = (type: 'scry' | 'surveil') => {
    if (!player) return;
    const maxCards = player.getDeck().getCardCount();
    useNumberPromptStore.getState().open({
      title: type === 'scry' ? 'Scry' : 'Surveil',
      label: 'How many cards?',
      min: 1,
      max: maxCards,
      defaultValue: 1,
      confirmLabel: type === 'scry' ? 'Scry' : 'Surveil',
      onConfirm: (count) => handleConfirm(count, type),
    });
  };

  useEffect(() => {
    const unsub = useScryStore.subscribe((state) => {
      if (!state.requested || !player) return;
      useScryStore.getState().consume();
      openPromptFor('scry');
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    const unsub = useSurveilStore.subscribe((state) => {
      if (!state.requested || !player) return;
      useSurveilStore.getState().consume();
      openPromptFor('surveil');
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Closing the scry viewer (X button, Escape, backdrop click, or an explicit
  // in-viewer close) returns any remaining scried cards to the top of the deck.
  const handleClose = () => {
    setIsOpen(false);
    if (!player) return;
    const scryPile = player.getScryPile();
    scryPile.getCards().forEach((card) => player.getDeck().addCardToTop(card));
    scryPile.clear();
  };

  const handleConfirm = (count: number, type: 'scry' | 'surveil') => {
    if (!player) return;

    const deck = player.getDeck();
    const scryPile = player.getScryPile();
    scryPile.clear();

    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = deck.drawCard();
      if (card) drawn.unshift(card);
    }
    drawn.forEach((card) => scryPile.addCardToTop(card));

    if (yDoc && playerId) {
      logAction(yDoc, {
        actorId: playerId,
        type,
        text: `${type === 'scry' ? 'scried' : 'surveiled'} ${count} card${count === 1 ? '' : 's'}`,
      });
    }

    setCards(scryPile.getCards());
    setIsOpen(true);
  };

  return (
    <PileViewerReact
      isOpen={isOpen}
      onClose={handleClose}
      cards={cards}
      pileType="scry"
      callbacks={{
        onMoveToDiscard: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'discard');
          setCards(player.getScryPile().getCards());
        },
        onMoveToDeckTop: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'deck');
          setCards(player.getScryPile().getCards());
        },
        onMoveToDeckBottom: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'deck', 0);
          setCards(player.getScryPile().getCards());
        },
      }}
    />
  );
}
