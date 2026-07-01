import React, { useState, useEffect, useRef } from 'react';
import { PileViewer } from './components/PileViewer';
import { useScryStore } from './scryStore';
import { useSurveilStore } from './surveilStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { logAction } from '@/features/action-log/actionLog';
import { useNumberPromptStore } from '@/features/game-actions/numberPromptStore';

export function ScryManager() {
  const player = useGameInstance((s) => s.player);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const viewerRef = useRef<PileViewer | null>(null);
  const actionTypeRef = useRef<'scry' | 'surveil'>('scry');

  // Lazy-init the PileViewer — must be stable across renders.
  const getViewer = (): PileViewer => {
    if (!viewerRef.current) {
      viewerRef.current = new PileViewer({
        onMoveToDiscard: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'discard');
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
        onMoveToDeckTop: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'deck');
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
        onMoveToDeckBottom: (card) => {
          if (!player) return;
          player.movePileCard(card, 'scry', 'deck', 0);
          viewerRef.current?.updateCards(player.getScryPile().getCards());
        },
      });
    }
    return viewerRef.current;
  };

  const openPromptFor = (type: 'scry' | 'surveil') => {
    if (!player) return;
    actionTypeRef.current = type;
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

  const handleConfirm = (count: number, type: 'scry' | 'surveil') => {
    if (!player) return;

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
      logAction(yDoc, {
        actorId: playerId,
        type,
        text: `${type === 'scry' ? 'scried' : 'surveiled'} ${count} card${count === 1 ? '' : 's'}`,
      });
    }

    getViewer().show(scryPile.getCards(), 'scry');
  };

  return null;
}
