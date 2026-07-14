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
 * Everything a step needs to decide whether it is done. Deliberately describes
 * *state*, not the route the player took to reach it — playing a card by drag,
 * by hotkey, or from a pile all leave the same trace here, so a new play-path
 * satisfies the `play` step for free.
 */
export interface TourSnapshot {
  /** Board cards owned by the local player. An opponent's card never counts. */
  myBoardCards: WhiteboardCard[];
  handSize: number;
  /** Hand size when the tour started — `draw` means "more cards than you began with". */
  baselineHandSize: number;
  roomLinkCopied: boolean;
  /** Peers in the room, including the local player. */
  playerCount: number;
}

/** Which element a step points at, per layout. `null` renders a centered, anchorless mark. */
export interface TourAnchor {
  desktop: string | null;
  phone: string | null;
}

export interface TourStep {
  id: TourStepId;
  anchor: TourAnchor;
  /** Verbs differ by input: you *click* a card with a mouse, but *long press* it on touch. */
  copy: { desktop: string; phone: string };
  /**
   * Informational steps have no game action to observe, so they advance on a
   * button press instead of a snapshot predicate.
   */
  advance: 'action' | 'button';
}
