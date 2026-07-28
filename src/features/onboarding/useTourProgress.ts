/**
 * Starts the tour for new players, then watches the game and advances it.
 *
 * The watching is deliberately dumb: on any change to the board or the local
 * player's state, rebuild a snapshot and ask the current step whether it's done.
 * No action hooks, no event bus — see tourProgress.ts for why.
 */
import { useEffect } from 'react';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER } from '@/constants';
import { isTourEnabled, resolveTourStepOrder } from '@/infrastructure/analytics/FeatureFlags';
import { registerTourOutcome } from '@/infrastructure/analytics/PosthogFunctions';
import { countPlayersInRoom } from '@/infrastructure/networking/roomOccupancy';
import { isOnboardingAudience } from '@/shared/services/visitCount';
import type { WhiteboardCard } from '@/features/battlefield/types';
import { buildTourSnapshot, isStepComplete, readCounts } from './tourProgress';
import { useShowTouchCopy } from './useShowTouchCopy';
import { useTourStore } from './tourStore';

export function useTourProgress(): void {
  const showTouchCopy = useShowTouchCopy();
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const awareness = useGameInstance((s) => s.awareness);

  const tourOutcome = useSettingsStore((s) => s.tourOutcome);
  const replayRequested = useTourStore((s) => s.replayRequested);

  // ── Stamp the outcome onto every event ───────────────────────────────────
  // Not just the tour's own events: a returning player who finished (or bailed
  // out of) the tour months ago should still carry it, so any insight —
  // retention, sessions, deck imports — can be split by how they onboarded.
  // That comparison is the entire justification for the feature.
  useEffect(() => {
    registerTourOutcome(tourOutcome);
  }, [tourOutcome]);

  // ── Start ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!yDoc || !playerId) return;
    if (useTourStore.getState().active) return;

    // New players get it automatically; anyone can ask for it from Settings, and
    // asking makes you the audience regardless of how long you've been here.
    const shouldStart = replayRequested || (!tourOutcome && isOnboardingAudience());
    if (!shouldStart) return;

    let cancelled = false;
    // Both flags resolve against the same memoized flag-load race, so this is one
    // round trip, not two.
    void Promise.all([isTourEnabled(), resolveTourStepOrder()]).then(([enabled, variant]) => {
      // The flag round-trip can take up to 1.5s — long enough for the player to
      // have skipped, or for this effect to have been torn down.
      if (cancelled || !enabled || useTourStore.getState().active) return;

      useTourStore.getState().start({
        tourId: 'intro',
        variant,
        layout: showTouchCopy ? 'phone' : 'desktop',
        // The store re-reads this on every step transition, so each step is
        // measured against the game as it stood when *that step* appeared.
        readCounts: () => readCounts(yDoc, playerId),
      });
    });

    return () => {
      cancelled = true;
    };
    // `showTouchCopy` is the analytics label only — re-running on a device
    // rotation would restart the tour, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yDoc, playerId, tourOutcome, replayRequested]);

  // ── Advance ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!yDoc || !playerId) return;

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const yPlayerState = yDoc.getMap(YDOC_PLAYER(playerId));

    const check = () => {
      const tour = useTourStore.getState();
      if (!tour.active) return;

      // Re-reading a step they've already done — leave them there until they
      // page forward themselves, or Back would bounce straight off the step it
      // was meant to reveal.
      if (tour.isReviewing()) return;

      const step = tour.steps[tour.stepIndex];
      // Informational steps wait on their button, not on the game.
      if (step.advance !== 'action') return;

      const snapshot = buildTourSnapshot({
        yDoc,
        playerId,
        baseline: tour.baseline,
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

    check();

    return () => {
      unsubscribeStore();
      yCards.unobserve(check);
      yPlayerState.unobserve(check);
      awareness?.off('change', check);
    };
  }, [yDoc, playerId, awareness]);
}
