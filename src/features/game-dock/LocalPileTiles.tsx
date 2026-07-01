import { useCallback, useEffect, useRef } from 'react';
import { PileViewer } from './components/PileViewer';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePileViewerOpenStore } from './pileViewerOpenStore';
import { DeckPersistenceService } from '@/infrastructure/persistence';

/**
 * Headless component: manages PileViewer instances and bridges the
 * usePileViewerOpenStore signal (fired by board PileNodes on click) to
 * the imperative PileViewer modals.  No DOM output.
 */
export function LocalPileTiles() {
  const player = useGameInstance((s) => s.player);
  const roomManager = useGameInstance((s) => s.roomManager);
  const playerRef = useRef(player);
  const roomManagerRef = useRef(roomManager);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);
  useEffect(() => {
    roomManagerRef.current = roomManager;
  }, [roomManager]);

  const deckViewerRef = useRef<PileViewer | null>(null);
  const exileViewerRef = useRef<PileViewer | null>(null);
  const discardViewerRef = useRef<PileViewer | null>(null);

  const getDeckViewer = useCallback((): PileViewer => {
    if (!deckViewerRef.current) {
      deckViewerRef.current = new PileViewer({
        onPlayToBattlefield: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'deck');
          window.dispatchEvent(new CustomEvent('playCard', { detail: { card, playerId: p.getId() } }));
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToHand: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'deck', 'hand');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDiscard: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'deck', 'discard');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToExile: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'deck', 'exile');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'deck', 'deck');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'deck', 'deck', 0);
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onShuffleDeck: () => {
          const p = playerRef.current;
          if (!p) return;
          p.shuffleDeck();
          const rm = roomManagerRef.current;
          if (rm) DeckPersistenceService.saveDeckForRoom(rm.getRoomName(), p.getDeck());
        },
      });
    }
    return deckViewerRef.current;
  }, []);

  const getExileViewer = useCallback((): PileViewer => {
    if (!exileViewerRef.current) {
      exileViewerRef.current = new PileViewer({
        onPlayToBattlefield: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'exile');
          window.dispatchEvent(new CustomEvent('playCard', { detail: { card, playerId: p.getId() } }));
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToHand: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'exile', 'hand');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDiscard: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'exile', 'discard');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'exile', 'deck');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'exile', 'deck', 0);
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
      });
    }
    return exileViewerRef.current;
  }, []);

  const getDiscardViewer = useCallback((): PileViewer => {
    if (!discardViewerRef.current) {
      discardViewerRef.current = new PileViewer({
        onPlayToBattlefield: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'discard');
          window.dispatchEvent(new CustomEvent('playCard', { detail: { card, playerId: p.getId() } }));
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToHand: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'discard', 'hand');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToExile: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'discard', 'exile');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'discard', 'deck');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.movePileCard(card, 'discard', 'deck', 0);
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onExileAll: () => {
          const p = playerRef.current;
          if (!p) return;
          p.exileAllDiscard();
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
      });
    }
    return discardViewerRef.current;
  }, []);

  const viewPile = useCallback(
    (pile: 'deck' | 'exile' | 'discard') => {
      const p = playerRef.current;
      if (!p) return;
      switch (pile) {
        case 'deck':
          getDeckViewer().show(p.getDeckCards(), 'deck');
          break;
        case 'exile':
          getExileViewer().show(p.getState().exilePile, 'exile');
          break;
        case 'discard':
          getDiscardViewer().show(p.getState().discardPile, 'discard');
          break;
      }
    },
    [getDeckViewer, getExileViewer, getDiscardViewer],
  );

  useEffect(() => {
    const unsub = usePileViewerOpenStore.subscribe((state) => {
      const req = state.request;
      if (!req || req.scope !== 'local') return;
      usePileViewerOpenStore.getState().clear();
      viewPile(req.pile);
    });
    return unsub;
  }, [viewPile]);

  useEffect(() => {
    return () => {
      deckViewerRef.current?.close();
      exileViewerRef.current?.close();
      discardViewerRef.current?.close();
    };
  }, []);

  return null;
}