/**
 * OpponentPileViewers
 *
 * Mounts once in App.tsx. Manages imperative PileViewer instances for opponents
 * and handles:
 * - Opening read-only opponent pile viewers on demand (via pileViewerOpenStore).
 * - Deck-reveal count toasts when an opponent peeks at their deck.
 *
 * Ported from OpponentHealthList (which is deleted in Phase 1).
 */
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { toast } from 'sonner';
import { PileViewer } from '@/features/game-dock/components/PileViewer';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import {
  YDOC_PLAYER,
  YSTATE_CAN_VIEW_HAND,
  YSTATE_DISCARD_PILE,
  YSTATE_EXILE_PILE,
  YSTATE_HAND,
  YSTATE_PLAYER_NAME,
} from '@/constants';
import { Card } from '@/features/player/types';

interface OpponentPileViewersProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

export function OpponentPileViewers({ yDoc, localPlayerId }: OpponentPileViewersProps) {
  const viewersRef = useRef<Map<string, { exile: PileViewer; discard: PileViewer; hand: PileViewer }>>(
    new Map(),
  );
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

      if (pile === 'hand') {
        const allowed = (opponentMap.get(YSTATE_CAN_VIEW_HAND) as boolean | undefined) ?? false;
        if (!allowed) return;
        const cards = (opponentMap.get(YSTATE_HAND) as Card[] | undefined) ?? [];
        getOrCreateViewer(playerId).hand.show(cards, 'hand');
      } else if (pile === 'exile') {
        const cards = (opponentMap.get(YSTATE_EXILE_PILE) as Card[] | undefined) ?? [];
        getOrCreateViewer(playerId).exile.show(cards, 'exile');
      } else if (pile === 'discard') {
        const cards = (opponentMap.get(YSTATE_DISCARD_PILE) as Card[] | undefined) ?? [];
        getOrCreateViewer(playerId).discard.show(cards, 'discard');
      }
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
        let prevDeckRevealCount: number = (opponentMap.get('deckRevealCount') as number | undefined) ?? 0;

        const observer = (event: Y.YMapEvent<any>) => {
          if (!event.changes.keys.has('deckRevealCount')) return;
          const count = (opponentMap.get('deckRevealCount') as number | undefined) ?? 0;
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
      viewersRef.current.forEach((viewers) => {
        viewers.exile.close();
        viewers.discard.close();
        viewers.hand.close();
      });
    };
  }, [yDoc, localPlayerId]);

  function getOrCreateViewer(playerId: string) {
    if (!viewersRef.current.has(playerId)) {
      viewersRef.current.set(playerId, {
        exile: new PileViewer({}),
        discard: new PileViewer({}),
        hand: new PileViewer({}),
      });
    }
    return viewersRef.current.get(playerId)!;
  }

  return null; // purely imperative — renders nothing
}
