/**
 * Tour UI state. Holds where the player is in the tour and nothing about the
 * game — step *completion* is derived from Yjs in tourProgress.ts, and the only
 * thing that writes here is useTourProgress (plus the two direct pokes below).
 */
import { create } from 'zustand';
import { useSettingsStore } from '@/app/stores/settingsStore';
import {
  trackTourCompleted,
  trackTourSkipped,
  trackTourStarted,
  trackTourStepCompleted,
  trackTourStepViewed,
} from '@/infrastructure/analytics/PosthogFunctions';
import { stepsForVariant } from './tourSteps';
import type { TourLayout, TourStep, TourVariant } from './types';

interface TourStore {
  active: boolean;
  variant: TourVariant;
  steps: TourStep[];
  stepIndex: number;
  /** Layout at start — for analytics only. The overlay reads the live one. */
  layout: TourLayout;
  /**
   * Hand size when the tour began. `draw` completes on "more cards than you
   * started with", so a player who begins mid-game with 7 cards isn't told
   * they've already drawn.
   */
  baselineHandSize: number;
  roomLinkCopied: boolean;
  /** When the current step became active — becomes `dwell_ms` on completion. */
  stepStartedAt: number;
  /**
   * Set by Settings > Replay. Distinct from simply clearing `tourCompleted`,
   * because a replay must bypass the new-player gate — someone who asked for the
   * tour is the audience for it, however many times they've visited.
   */
  replayRequested: boolean;

  start: (opts: { variant: TourVariant; baselineHandSize: number; layout: TourLayout }) => void;
  /** The current step is done (action observed, or button pressed) — move on. */
  advance: () => void;
  skip: () => void;
  requestReplay: () => void;
  noteRoomLinkCopied: () => void;
}

function finish(): void {
  useSettingsStore.getState().setTourCompleted(true);
}

export const useTourStore = create<TourStore>((set, get) => ({
  active: false,
  variant: 'control',
  steps: [],
  stepIndex: 0,
  layout: 'desktop',
  baselineHandSize: 0,
  roomLinkCopied: false,
  stepStartedAt: 0,
  replayRequested: false,

  start: ({ variant, baselineHandSize, layout }) => {
    const steps = stepsForVariant(variant);
    if (steps.length === 0) return;

    set({
      active: true,
      variant,
      steps,
      stepIndex: 0,
      layout,
      baselineHandSize,
      roomLinkCopied: false,
      stepStartedAt: Date.now(),
      // Consumed — a replay that has begun is just a running tour.
      replayRequested: false,
    });

    const ctx = { variant, layout, stepId: steps[0].id, stepIndex: 0 };
    trackTourStarted(ctx);
    trackTourStepViewed(ctx);
  },

  advance: () => {
    const { active, steps, stepIndex, variant, layout, stepStartedAt } = get();
    if (!active) return;

    const completed = steps[stepIndex];
    trackTourStepCompleted({
      variant,
      layout,
      stepId: completed.id,
      stepIndex,
      dwellMs: Date.now() - stepStartedAt,
    });

    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      set({ active: false });
      trackTourCompleted({ variant, layout, stepCount: steps.length });
      finish();
      return;
    }

    set({ stepIndex: nextIndex, stepStartedAt: Date.now() });
    trackTourStepViewed({ variant, layout, stepId: steps[nextIndex].id, stepIndex: nextIndex });
  },

  skip: () => {
    const { active, steps, stepIndex, variant, layout } = get();
    if (!active) return;

    set({ active: false });
    trackTourSkipped({ variant, layout, stepId: steps[stepIndex].id, stepIndex });
    finish();
  },

  requestReplay: () => {
    // Also clears the persisted flag, so a replay the player abandons doesn't
    // leave them marked as "onboarded" on a tour they never finished.
    useSettingsStore.getState().setTourCompleted(false);
    set({ replayRequested: true });
  },

  noteRoomLinkCopied: () => {
    // Copying the link is the one step-completion signal that leaves no trace in
    // Yjs, so it has to be pushed in. One call site (RoomLinkButton), so this
    // stays honest rather than becoming a second, parallel progress mechanism.
    if (get().active) set({ roomLinkCopied: true });
  },
}));
