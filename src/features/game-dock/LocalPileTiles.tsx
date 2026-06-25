import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { PileViewer } from './components/PileViewer';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { usePileViewerOpenStore } from './pileViewerOpenStore';
import { HotkeyTooltip } from '@/features/hotkeys/HotkeyTooltip';

function useYjsArrayLength(yPlayerState: Y.Map<any> | null, key: string): number {
  const [length, setLength] = useState<number>(() => {
    const val = yPlayerState?.get(key);
    return Array.isArray(val) ? val.length : 0;
  });
  useEffect(() => {
    if (!yPlayerState) return;
    const observer = () => {
      const val = yPlayerState.get(key);
      setLength(Array.isArray(val) ? val.length : 0);
    };
    yPlayerState.observe(observer);
    observer();
    return () => yPlayerState.unobserve(observer);
  }, [yPlayerState, key]);
  return length;
}

type LocalPile = 'deck' | 'exile' | 'discard';

export function LocalPileTiles() {
  const player = useGameInstance((s) => s.player);
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const deckCount = useYjsArrayLength(yPlayerState, 'deck');
  const exileCount = useYjsArrayLength(yPlayerState, 'exilePile');
  const discardCount = useYjsArrayLength(yPlayerState, 'discardPile');

  const deckViewerRef = useRef<PileViewer | null>(null);
  const exileViewerRef = useRef<PileViewer | null>(null);
  const discardViewerRef = useRef<PileViewer | null>(null);

  // Tooltip state — mouse position only updates while a pile is hovered
  const [hoveredPile, setHoveredPile] = useState<LocalPile | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const hoveredPileRef = useRef<LocalPile | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (hoveredPileRef.current) setMousePos({ x: e.clientX, y: e.clientY });
    };
    const onDown = () => setIsMouseDown(true);
    const onUp = () => setIsMouseDown(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

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
          p.removeCardFromPileById(card.id, 'deck');
          p.placeCardInPile(card, 'hand');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDiscard: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'deck');
          p.placeCardInPile(card, 'discard');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToExile: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'deck');
          p.placeCardInPile(card, 'exile');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'deck');
          p.placeCardInPile(card, 'deck');
          deckViewerRef.current?.updateCards(p.getDeckCards());
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'deck');
          p.placeCardInPile(card, 'deck', 0);
          deckViewerRef.current?.updateCards(p.getDeckCards());
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
          p.removeCardFromPileById(card.id, 'exile');
          p.placeCardInPile(card, 'hand');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDiscard: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'exile');
          p.placeCardInPile(card, 'discard');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'exile');
          p.placeCardInPile(card, 'deck');
          exileViewerRef.current?.updateCards(p.getState().exilePile);
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'exile');
          p.placeCardInPile(card, 'deck', 0);
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
          p.removeCardFromPileById(card.id, 'discard');
          p.placeCardInPile(card, 'hand');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToExile: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'discard');
          p.placeCardInPile(card, 'exile');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToDeckTop: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'discard');
          p.placeCardInPile(card, 'deck');
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
        onMoveToDeckBottom: (card) => {
          const p = playerRef.current;
          if (!p) return;
          p.removeCardFromPileById(card.id, 'discard');
          p.placeCardInPile(card, 'deck', 0);
          discardViewerRef.current?.updateCards(p.getState().discardPile);
        },
      });
    }
    return discardViewerRef.current;
  }, []);

  const viewPile = useCallback(
    (pile: LocalPile) => {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  };
  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  };
  const handleDrop = (e: React.DragEvent, pileType: LocalPile) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
    const cardId = e.dataTransfer?.getData('text/plain');
    if (!cardId) return;
    const p = playerRef.current;
    if (!p) return;
    const card = p.getState().hand.find((c) => c.id === cardId);
    if (!card) return;
    p.removeCardFromHand(cardId);
    p.placeCardInPile(card, pileType);
  };

  const handleMouseEnter = (pile: LocalPile) => {
    hoveredPileRef.current = pile;
    setHoveredPile(pile);
    useHotkeyStore.getState().setHoveredPile(pile);
  };
  const handleMouseLeave = () => {
    hoveredPileRef.current = null;
    setHoveredPile(null);
    useHotkeyStore.getState().setHoveredPile(null);
  };

  if (!yPlayerState) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 920,
          display: 'flex',
          gap: '16px',
        }}
      >
        <div
          className="resource-pile exile-pile"
          onMouseEnter={() => handleMouseEnter('exile')}
          onMouseLeave={handleMouseLeave}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'exile')}
          onClick={() => viewPile('exile')}
        >
          <div className="pile-label">Exile</div>
          <div className="pile-count">{exileCount}</div>
        </div>

        <div
          className="resource-pile discard-pile"
          onMouseEnter={() => handleMouseEnter('discard')}
          onMouseLeave={handleMouseLeave}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'discard')}
          onClick={() => viewPile('discard')}
        >
          <div className="pile-label">Discard</div>
          <div className="pile-count">{discardCount}</div>
        </div>

        <div
          className="resource-pile deck-pile"
          onMouseEnter={() => handleMouseEnter('deck')}
          onMouseLeave={handleMouseLeave}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'deck')}
          onClick={() => viewPile('deck')}
        >
          <div className="pile-label">Deck</div>
          <div className="pile-count">{deckCount}</div>
          <button
            className="draw-button"
            onClick={(e) => {
              e.stopPropagation();
              playerRef.current?.drawCard();
            }}
          >
            Draw
          </button>
        </div>
      </div>

      {hoveredPile && !isMouseDown && (
        <HotkeyTooltip
          context={hoveredPile}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
          isMouseDown={isMouseDown}
        />
      )}
    </>
  );
}
