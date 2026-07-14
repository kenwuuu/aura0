import type { WhiteboardCard } from '@/features/battlefield/types';

/**
 * Steps of the first-run tour. Every shipping step waits on a real game action;
 * `history` is informational (button-advance) and currently disabled.
 */
export type TourStepId =
  | 'play'
  | 'tap'
  | 'draw'
  | 'invite'
  // Defined but currently in no STEP_ORDER — see the note there.
  | 'history';

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
 * Where the coach mark sits. It follows the action:
 *
 *  - `aboveHand` — the whole early game happens down at the hand (play, tap,
 *    draw), so the bubble parks there with a tail pointing down at the cards and
 *    stays put across those steps rather than hopping around.
 *  - `belowAnchor` — sits under `anchor` with a tail pointing *up* at it. Used by
 *    `invite`, which is about one specific button up in the toolbar.
 *  - `top` — out of the way. Nothing in the shipping orders uses it today.
 */
export type TourPlacement = 'top' | 'aboveHand' | 'belowAnchor';

export interface TourStep {
  id: TourStepId;
  placement: TourPlacement;
  /**
   * CSS selector for the element this step is about. Required by `belowAnchor`,
   * and the thing `halo` rings. Prefer a `data-testid` the e2e harness already
   * owns (tests/e2e/harness/selectors.ts) so a step and a test point at the same
   * element by construction.
   */
  anchor?: string;
  /**
   * Draw a ring around `anchor`. Reserved for steps about a *specific control* —
   * a halo on a hand card just competed with the card art for attention.
   */
  halo?: boolean;
  /**
   * Draw the bubble's tail. Defaults to true. Turn it off when the bubble sits
   * somewhere for continuity rather than to point: `tap` and `draw` keep the
   * bubble parked above the hand so it doesn't hop about, but their actions happen
   * on the *board* — a tail aimed at the hand would be pointing at the wrong thing.
   */
  tail?: boolean;
  /** Verbs differ by input: you *click* a card with a mouse, but *long press* it on touch. */
  copy: { desktop: string; phone: string };
  /**
   * Informational steps have no game action to observe, so they advance on a
   * button press instead of a snapshot predicate.
   */
  advance: 'action' | 'button';
}
