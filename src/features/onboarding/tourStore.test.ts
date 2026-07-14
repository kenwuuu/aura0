import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTourStore } from './tourStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import type { StepBaseline } from './types';

vi.mock('@/infrastructure/analytics/PosthogFunctions', () => ({
  trackTourStarted: vi.fn(),
  trackTourStepViewed: vi.fn(),
  trackTourStepCompleted: vi.fn(),
  trackTourCompleted: vi.fn(),
  trackTourSkipped: vi.fn(),
}));

/** Stands in for the live game: the store re-reads this on each step transition. */
function fakeGame(initial: StepBaseline) {
  const counts = { ...initial };
  return {
    counts,
    readCounts: () => ({ ...counts }),
  };
}

function startTour(readCounts: () => StepBaseline) {
  useTourStore.getState().start({ variant: 'control', layout: 'desktop', readCounts });
}

describe('tourStore', () => {
  beforeEach(() => {
    useTourStore.setState({ active: false, stepIndex: 0, furthestIndex: 0 });
    useSettingsStore.setState({ tourCompleted: false });
  });

  it('re-reads the baseline on every step transition, not just at the start', () => {
    // The player opens with 8 cards and an empty board.
    const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
    startTour(game.readCounts);
    expect(useTourStore.getState().baseline.handSize).toBe(8);

    // They play a card: the hand drops to 7.
    game.counts.handSize = 7;
    game.counts.boardCardCount = 1;
    useTourStore.getState().advance(); // play -> tap

    // The `tap` step must be measured against the game as it is NOW (hand 7),
    // not as it was when the tour began (hand 8). Getting this wrong is what
    // made `draw` silently require two draws.
    expect(useTourStore.getState().baseline).toEqual({
      handSize: 7,
      boardCardCount: 1,
      tappedCardCount: 0,
    });
  });

  it('steps in the control order', () => {
    const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
    startTour(game.readCounts);

    const ids = () => useTourStore.getState().steps[useTourStore.getState().stepIndex].id;
    expect(ids()).toBe('play');
    useTourStore.getState().advance();
    expect(ids()).toBe('tap');
    useTourStore.getState().advance();
    expect(ids()).toBe('draw');
  });

  describe('Back', () => {
    it('does nothing on the first step', () => {
      const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
      startTour(game.readCounts);

      useTourStore.getState().back();
      expect(useTourStore.getState().stepIndex).toBe(0);
    });

    it('re-opens a finished step, and marks the tour as reviewing so the game cannot auto-advance', () => {
      const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
      startTour(game.readCounts);
      useTourStore.getState().advance(); // play -> tap
      expect(useTourStore.getState().isReviewing()).toBe(false);

      useTourStore.getState().back();
      expect(useTourStore.getState().stepIndex).toBe(0);
      // Without this, the watcher would see `play` still satisfied (the card is
      // still on the board) and immediately fling the player back to `tap`.
      expect(useTourStore.getState().isReviewing()).toBe(true);
    });

    it('paging forward out of review re-arms auto-advance with a fresh baseline', () => {
      const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
      startTour(game.readCounts);

      game.counts.handSize = 7;
      game.counts.boardCardCount = 1;
      useTourStore.getState().advance(); // play -> tap
      useTourStore.getState().back(); // reviewing `play`

      // The game moves on while they're reading.
      game.counts.tappedCardCount = 1;

      useTourStore.getState().advance(); // page forward, back to `tap`
      expect(useTourStore.getState().stepIndex).toBe(1);
      expect(useTourStore.getState().isReviewing()).toBe(false);
      expect(useTourStore.getState().baseline.tappedCardCount).toBe(1);
    });
  });

  it('skip ends the tour and marks it completed', () => {
    const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
    startTour(game.readCounts);

    useTourStore.getState().skip();
    expect(useTourStore.getState().active).toBe(false);
    expect(useSettingsStore.getState().tourCompleted).toBe(true);
  });

  it('running off the end completes the tour', () => {
    const game = fakeGame({ handSize: 8, boardCardCount: 0, tappedCardCount: 0 });
    startTour(game.readCounts);

    const stepCount = useTourStore.getState().steps.length;
    for (let i = 0; i < stepCount; i++) useTourStore.getState().advance();

    expect(useTourStore.getState().active).toBe(false);
    expect(useSettingsStore.getState().tourCompleted).toBe(true);
  });
});
