/**
 * Starts the tour for new players, then watches the game and advances it.
 *
 * The watching is deliberately dumb: on any change to the board or the local
 * player's state, rebuild a snapshot and ask the current step whether it's done.
 * No action hooks, no event bus — see tourProgress.ts for why.
 */
import { useEffect } from 'react';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER, YSTATE_HAND } from '@/constants';
import { resolveTourStepOrder } from '@/infrastructure/analytics/FeatureFlags';
import { countPlayersInRoom } from '@/infrastructure/networking/roomOccupancy';
import { usePhoneLayout } from '@/shared/hooks';
import { isOnboardingAudience } from '@/shared/services/visitCount';
import type { Card } from '@/features/player';
import type { WhiteboardCard } from '@/features/battlefield/types';
import { buildTourSnapshot, isStepComplete } from './tourProgress';
import { useTourStore } from './tourStore';

export function useTourProgress(): void {
  const isPhone = usePhoneLayout();
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const awareness = useGameInstance((s) => s.awareness);

  // ── Start ────────────────────────────────────────────────────────────────
  const tourCompleted = useSettingsStore((s) => s.tourCompleted);
  const replayRequested = useTourStore((s) => s.replayRequested);

  useEffect(() => {
    if (!yDoc || !playerId) return;
    if (useTourStore.getState().active) return;

    // New players get it automatically; anyone can ask for it from Settings, and
    // asking makes you the audience regardless of how long you've been here.
    const shouldStart = replayRequested || (!tourCompleted && isOnboardingAudience());
    if (!shouldStart) return;

    let cancelled = false;
    void resolveTourStepOrder().then((variant) => {
      // The flag round-trip can take up to 1.5s — long enough for the player to
      // have skipped, or for this effect to have been torn down.
      if (cancelled || useTourStore.getState().active) return;

      const hand = (yDoc.getMap(YDOC_PLAYER(playerId)).get(YSTATE_HAND) ?? []) as Card[];
      useTourStore.getState().start({
        variant,
        baselineHandSize: hand.length,
        layout: isPhone ? 'phone' : 'desktop',
      });
    });

    return () => {
      cancelled = true;
    };
    // `isPhone` is the analytics label only — re-running on a device rotation
    // would restart the tour, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yDoc, playerId, tourCompleted, replayRequested]);

  // ── Advance ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!yDoc || !playerId) return;

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const yPlayerState = yDoc.getMap(YDOC_PLAYER(playerId));

    const check = () => {
      const tour = useTourStore.getState();
      if (!tour.active) return;

      const step = tour.steps[tour.stepIndex];
      // Informational steps wait on their button, not on the game.
      if (step.advance !== 'action') return;

      const snapshot = buildTourSnapshot({
        yDoc,
        playerId,
        baselineHandSize: tour.baselineHandSize,
        roomLinkCopied: tour.roomLinkCopied,
        playerCount: awareness ? countPlayersInRoom(awareness) : 1,
      });

      if (isStepComplete(step.id, snapshot)) tour.advance();
    };

    // `roomLinkCopied` is pushed into the store rather than living in Yjs, so the
    // store itself is a change source alongside the doc.
    const unsubscribeStore = useTourStore.subscribe(check);
    yCards.observe(check);
    yPlayerState.observe(check);
    awareness?.on('change', check);

    // A step may already be satisfied on arrival — e.g. `draw_first` puts `draw`
    // first, and a player who reloads mid-game lands with cards already played.
    check();

    return () => {
      unsubscribeStore();
      yCards.unobserve(check);
      yPlayerState.unobserve(check);
      awareness?.off('change', check);
    };
  }, [yDoc, playerId, awareness]);
}
