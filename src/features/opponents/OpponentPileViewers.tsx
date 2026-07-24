/**
 * OpponentPileViewers
 *
 * Mounts once in App.tsx. Renders read-only PileViewerReact instances for
 * opponent piles and handles:
 * - Opening read-only opponent pile viewers on demand (via pileViewerOpenStore).
 * - Deck-reveal count toasts when an opponent peeks at their deck.
 *
 * Ported from OpponentHealthList (which is deleted in Phase 1).
 */
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { toast } from 'sonner';
import { PileViewerReact } from '@/features/game-dock/components/PileViewerReact';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import {
  YDOC_PLAYER,
  YSTATE_CAN_VIEW_HAND,
  YSTATE_DISCARD_PILE,
  YSTATE_EXILE_PILE,
  YSTATE_HAND,
  YSTATE_PLAYER_NAME,
  YSTATE_DECK_REVEAL_COUNT,
} from '@/constants';
import { Card } from '@/features/player/types';

interface OpponentPileViewersProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

type OpponentPile = 'exile' | 'discard' | 'hand';

interface OpenOpponentViewer {
  playerId: string;
  pile: OpponentPile;
  cards: Card[];
  isOpen: boolean;
}

function viewerKey(playerId: string, pile: OpponentPile): string {
  return `${playerId}-${pile}`;
}

export function OpponentPileViewers({ yDoc, localPlayerId }: OpponentPileViewersProps) {
  // Keyed by `${playerId}-${pile}` so viewing multiple opponents'/piles' cards
  // at once behaves the same as before — opening one doesn't close another.
  const [viewers, setViewers] = useState<Map<string, OpenOpponentViewer>>(new Map());
  // Track which player-* keys we've already set up deckRevealCount observers for
  const observedKeysRef = useRef<Set<string>>(new Set());
  const unobserversRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Subscribe to pile-open requests targeted at opponent piles
    const unsubOpen = usePileViewerOpenStore.subscribe((state) => {
      const req = state.request;
      if (!req || req.scope !== 'opponent') return;
      usePileViewerOpenStore.getState().clear();

      const { playerId, pile } = req;
      const opponentMap = yDoc.getMap(YDOC_PLAYER(playerId));

      let cards: Card[];
      if (pile === 'hand') {
        const allowed = (opponentMap.get(YSTATE_CAN_VIEW_HAND) as boolean | undefined) ?? false;
        if (!allowed) return;
        cards = (opponentMap.get(YSTATE_HAND) as Card[] | undefined) ?? [];
      } else if (pile === 'exile') {
        cards = (opponentMap.get(YSTATE_EXILE_PILE) as Card[] | undefined) ?? [];
      } else {
        cards = (opponentMap.get(YSTATE_DISCARD_PILE) as Card[] | undefined) ?? [];
      }

      setViewers((prev) => {
        const next = new Map(prev);
        next.set(viewerKey(playerId, pile), { playerId, pile, cards, isOpen: true });
        return next;
      });
    });

    // Set up per-opponent deckRevealCount toast observers
    const setupObservers = () => {
      yDoc.share.forEach((_, key) => {
        if (!key.startsWith('player-')) return;
        const opponentId = key.slice('player-'.length);
        if (opponentId === localPlayerId) return;
        if (observedKeysRef.current.has(key)) return;
        observedKeysRef.current.add(key);

        const opponentMap = yDoc.getMap(key);
        let prevDeckRevealCount: number = (opponentMap.get(YSTATE_DECK_REVEAL_COUNT) as number | undefined) ?? 0;

        const observer = (event: Y.YMapEvent<any>) => {
          if (!event.changes.keys.has(YSTATE_DECK_REVEAL_COUNT)) return;
          const count = (opponentMap.get(YSTATE_DECK_REVEAL_COUNT) as number | undefined) ?? 0;
          if (count === prevDeckRevealCount) return;
          prevDeckRevealCount = count;

          const name =
            (opponentMap.get(YSTATE_PLAYER_NAME) as string | undefined) ?? opponentId.slice(0, 9);
          if (count === -1) {
            toast.warning(`${name} revealed their entire deck`, {
              position: 'bottom-center',
              richColors: true,
            });
          } else if (count > 0) {
            toast.warning(
              `${name} revealed the top ${count} card${count > 1 ? 's' : ''} of their deck`,
              { position: 'bottom-center', richColors: true },
            );
          } else {
            toast.info(`${name} hid their deck`, { position: 'bottom-center' });
          }
        };

        opponentMap.observe(observer);
        unobserversRef.current.push(() => opponentMap.unobserve(observer));
      });
    };

    setupObservers();
    const interval = setInterval(setupObservers, 2000);

    return () => {
      unsubOpen();
      clearInterval(interval);
      unobserversRef.current.forEach((fn) => fn());
    };
  }, [yDoc, localPlayerId]);

  const closeViewer = (key: string) => {
    setViewers((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(key, { ...existing, isOpen: false });
      return next;
    });
  };

  return (
    <>
      {Array.from(viewers.entries()).map(([key, v]) => (
        <PileViewerReact
          key={key}
          isOpen={v.isOpen}
          onClose={() => closeViewer(key)}
          cards={v.cards}
          pileType={v.pile}
          callbacks={{}}
          // These cards live in the opponent's player map, not the local one —
          // point the preview's presence check there so it doesn't dismiss on
          // sight (see PileViewerReact's cardsOwnerState).
          cardsOwnerState={yDoc.getMap(YDOC_PLAYER(v.playerId))}
        />
      ))}
    </>
  );
}
