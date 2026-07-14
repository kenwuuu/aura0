import type { WhiteboardCard } from '@/features/battlefield/types';

/**
 * Steps of the first-run tour. `history` and `learn-more` are informational —
 * they have no game action to wait for and advance on their button instead.
 */
export type TourStepId =
  | 'play'
  | 'tap'
  | 'draw'
  | 'invite'
  | 'history'
  | 'learn-more';

/** A/B variant, resolved from the `onboarding-tour-step-order` PostHog flag. */
export type TourVariant = 'control' | 'draw_first';

export type TourLayout = 'phone' | 'desktop';

/**
 * Where the game stood when the *current step* became active.
 *
 * Per-step, not per-tour, and that distinction is the whole point. `draw`
 * completes when the hand grows — but in the `control` order the player has
 * already put a card down, so the hand is at 7 by the time the draw step
 * appears. Measured against the hand they *started the tour* with (8), drawing
 * back up to 8 isn't growth, and the step silently required two draws.
 */
export interface StepBaseline {
  handSize: number;
  boardCardCount: number;
  tappedCardCount: number;
}

/**
 * Everything a step needs to decide whether it is done. Deliberately describes
 * *state*, not the route the player took to reach it — playing a card by drag,
 * by hotkey, or from a pile all leave the same trace here, so a new play-path
 * satisfies the `play` step for free.
 */
export interface TourSnapshot {
  /** Board cards owned by the local player. An opponent's card never counts. */
  myBoardCards: WhiteboardCard[];
  handSize: number;
  baseline: StepBaseline;
  roomLinkCopied: boolean;
  /** Peers in the room, including the local player. */
  playerCount: number;
}

/**
 * Where the coach mark sits. It follows the action: the `play` step asks the
 * player to do something *in their hand*, so the mark sits just above the hand
 * with a tail pointing down at it. Everything else sits out of the way at the top.
 */
export type TourPlacement = 'top' | 'aboveHand';

export interface TourStep {
  id: TourStepId;
  placement: TourPlacement;
  /** Verbs differ by input: you *click* a card with a mouse, but *long press* it on touch. */
  copy: { desktop: string; phone: string };
  /**
   * Informational steps have no game action to observe, so they advance on a
   * button press instead of a snapshot predicate.
   */
  advance: 'action' | 'button';
}
