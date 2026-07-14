/**
 * Tour UI state. Holds where the player is in the tour and nothing about the
 * game — step *completion* is derived from Yjs in tourProgress.ts.
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
import type { StepBaseline, TourLayout, TourStep, TourVariant } from './types';

const EMPTY_BASELINE: StepBaseline = { handSize: 0, boardCardCount: 0, tappedCardCount: 0 };

interface TourStore {
  active: boolean;
  variant: TourVariant;
  steps: TourStep[];
  stepIndex: number;
  /**
   * The furthest step reached. Going Back makes `stepIndex < furthestIndex`,
   * which is what "reviewing" means: the player is re-reading a step they have
   * already done, so the game must NOT auto-advance them out of it again.
   */
  furthestIndex: number;
  /** Layout at start — for analytics only. The overlay reads the live one. */
  layout: TourLayout;
  /** Game counts as of the current step. See StepBaseline. */
  baseline: StepBaseline;
  roomLinkCopied: boolean;
  /** When the current step became active — becomes `dwell_ms` on completion. */
  stepStartedAt: number;
  /**
   * Set by Settings > Replay. Distinct from simply clearing `tourCompleted`,
   * because a replay must bypass the new-player gate — someone who asked for the
   * tour is the audience for it, however many times they've visited.
   */
  replayRequested: boolean;
  /** Reads the live game counts. Supplied by useTourProgress, which has the Y.Doc. */
  readCounts: (() => StepBaseline) | null;

  start: (opts: { variant: TourVariant; layout: TourLayout; readCounts: () => StepBaseline }) => void;
  /** The current step is done (action observed, or button pressed) — move on. */
  advance: () => void;
  /** Step backwards to re-read a step already passed. */
  back: () => void;
  /** Whether the game may auto-advance right now (i.e. we're not reviewing). */
  isReviewing: () => boolean;
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
  furthestIndex: 0,
  layout: 'desktop',
  baseline: EMPTY_BASELINE,
  roomLinkCopied: false,
  stepStartedAt: 0,
  replayRequested: false,
  readCounts: null,

  start: ({ variant, layout, readCounts }) => {
    const steps = stepsForVariant(variant);
    if (steps.length === 0) return;

    set({
      active: true,
      variant,
      steps,
      stepIndex: 0,
      furthestIndex: 0,
      layout,
      readCounts,
      baseline: readCounts(),
      roomLinkCopied: false,
      stepStartedAt: Date.now(),
      // Consumed — a replay that has begun is just a running tour.
      replayRequested: false,
    });

    const ctx = { variant, layout, stepId: steps[0].id, stepIndex: 0 };
    trackTourStarted(ctx);
    trackTourStepViewed(ctx);
  },

  isReviewing: () => get().stepIndex < get().furthestIndex,

  advance: () => {
    const { active, steps, stepIndex, furthestIndex, variant, layout, stepStartedAt, readCounts } = get();
    if (!active) return;

    const nextIndex = stepIndex + 1;

    // Paging forward through steps already done — no completion, no analytics.
    // Re-firing tour_step_viewed here would inflate the funnel's denominator
    // with steps the player is merely re-reading.
    if (stepIndex < furthestIndex) {
      set({ stepIndex: nextIndex });
      // Caught back up: take a fresh baseline so the game can resume advancing us.
      if (nextIndex >= furthestIndex && readCounts) {
        set({ baseline: readCounts(), stepStartedAt: Date.now() });
      }
      return;
    }

    trackTourStepCompleted({
      variant,
      layout,
      stepId: steps[stepIndex].id,
      stepIndex,
      dwellMs: Date.now() - stepStartedAt,
    });

    if (nextIndex >= steps.length) {
      set({ active: false });
      trackTourCompleted({ variant, layout, stepCount: steps.length });
      finish();
      return;
    }

    set({
      stepIndex: nextIndex,
      furthestIndex: Math.max(furthestIndex, nextIndex),
      baseline: readCounts ? readCounts() : EMPTY_BASELINE,
      stepStartedAt: Date.now(),
    });
    trackTourStepViewed({ variant, layout, stepId: steps[nextIndex].id, stepIndex: nextIndex });
  },

  back: () => {
    const { active, stepIndex } = get();
    if (!active || stepIndex === 0) return;
    set({ stepIndex: stepIndex - 1 });
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
