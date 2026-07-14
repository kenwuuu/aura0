import { useCallback, useEffect, useState } from 'react';
import { PileViewerReact, type PileViewerCallbacks } from './components/PileViewerReact';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { playCardFromPile } from '@/features/battlefield/battlefieldActions';
import { usePileViewerOpenStore } from './pileViewerOpenStore';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import type { Card, PileType, Player } from '@/features/player';

type LocalPileType = Exclude<PileType, 'hand' | 'scry'>;

function getLocalPileCards(player: Player, pile: LocalPileType): Card[] {
  switch (pile) {
    case 'deck': return player.getDeckCards();
    case 'exile': return player.getState().exilePile;
    case 'discard': return player.getState().discardPile;
    case 'sideboard': return player.getSideboardCards();
  }
}

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
  const [sideboardOpen, setSideboardOpen] = useState(false);
  const [sideboardCards, setSideboardCards] = useState<Card[]>([]);

  const viewPile = useCallback((pile: LocalPileType) => {
    if (!player) return;
    switch (pile) {
      case 'deck':
        setDeckCards(getLocalPileCards(player, 'deck'));
        setDeckOpen(true);
        break;
      case 'exile':
        setExileCards(getLocalPileCards(player, 'exile'));
        setExileOpen(true);
        break;
      case 'discard':
        setDiscardCards(getLocalPileCards(player, 'discard'));
        setDiscardOpen(true);
        break;
      case 'sideboard':
        setSideboardCards(getLocalPileCards(player, 'sideboard'));
        setSideboardOpen(true);
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

  // Every local pile viewer's callbacks follow the same shape: move the card
  // via Player.movePileCard, then refresh this pile's local cards state.
  // onMoveTo<X> is only offered for piles other than `pile` itself — except
  // the deck, which always offers top/bottom, since those reorder the deck
  // even when `pile` is 'deck' itself.
  const buildCallbacks = useCallback((pile: LocalPileType, setCards: (cards: Card[]) => void): PileViewerCallbacks => {
    if (!player) return {};

    const refresh = () => setCards(getLocalPileCards(player, pile));
    const move = (card: Card, dest: PileType, position?: number) => {
      player.movePileCard(card, pile, dest, position);
      refresh();
    };

    const callbacks: PileViewerCallbacks = {
      onPlayToBattlefield: (card) => {
        player.removeCardFromPileById(card.id, pile);
        playCardFromPile(card);
        refresh();
      },
      onMoveToHand: (card) => move(card, 'hand'),
      onMoveToDeckTop: (card) => move(card, 'deck'),
      onMoveToDeckBottom: (card) => move(card, 'deck', 0),
    };
    if (pile !== 'discard') callbacks.onMoveToDiscard = (card) => move(card, 'discard');
    if (pile !== 'exile') callbacks.onMoveToExile = (card) => move(card, 'exile');
    if (pile !== 'sideboard') callbacks.onMoveToSideboard = (card) => move(card, 'sideboard');

    if (pile === 'deck') {
      callbacks.onShuffleDeck = () => {
        player.shuffleDeck();
        if (roomManager) DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
      };
    }
    if (pile === 'discard') {
      callbacks.onExileAll = () => {
        player.exileAllDiscard();
        refresh();
      };
    }

    return callbacks;
  }, [player, roomManager]);

  return (
    <>
      <PileViewerReact
        isOpen={deckOpen}
        onClose={() => setDeckOpen(false)}
        cards={deckCards}
        pileType="deck"
        callbacks={buildCallbacks('deck', setDeckCards)}
      />
      <PileViewerReact
        isOpen={exileOpen}
        onClose={() => setExileOpen(false)}
        cards={exileCards}
        pileType="exile"
        callbacks={buildCallbacks('exile', setExileCards)}
      />
      <PileViewerReact
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        cards={discardCards}
        pileType="discard"
        callbacks={buildCallbacks('discard', setDiscardCards)}
      />
      <PileViewerReact
        isOpen={sideboardOpen}
        onClose={() => setSideboardOpen(false)}
        cards={sideboardCards}
        pileType="sideboard"
        callbacks={buildCallbacks('sideboard', setSideboardCards)}
      />
    </>
  );
}
