/**
 * The tour content. This is the file you edit to change a tour.
 *
 * Anchors are the same `data-testid`s the e2e harness already relies on
 * (tests/e2e/harness/selectors.ts), so a tour step and a test point at the same
 * element by construction.
 */
import type { TourStep, TourStepId, TourVariant } from './types';

export const TOUR_STEPS: Record<TourStepId, TourStep> = {
  play: {
    id: 'play',
    // The hand is a `position: fixed` overlay (FloatingHand), so this rect is
    // stable — unlike the board anchors below, it never moves with the viewport.
    anchor: { desktop: '[data-testid="hand-card"]', phone: '[data-testid="hand-card"]' },
    copy: {
      desktop: '**Play a card.** Drag it to the board.',
      // dnd-kit's TouchSensor needs a 300ms hold before the drag starts
      // (App.tsx), so "drag" on its own would be a lie on touch.
      phone: '**Play a card.** Long press, then drag it to the board.',
    },
    advance: 'action',
  },
  tap: {
    id: 'tap',
    anchor: { desktop: '[data-testid="battlefield-card"]', phone: '[data-testid="battlefield-card"]' },
    copy: {
      desktop: '**Tap it.** Click the card you just played.',
      phone: '**Tap it.** Tap the card you just played.',
    },
    advance: 'action',
  },
  draw: {
    id: 'draw',
    // Anchorless: the target is the empty board itself. A tap (touch) or
    // right-click (desktop) on the pane opens the Global menu, whose first entry
    // is Draw — one-click access without panning back to your deck.
    // Spotlighting the whole board would say nothing, so this mark is centered.
    anchor: { desktop: null, phone: null },
    copy: {
      desktop: '**Draw a card.** Right-click the board, then pick Draw.',
      phone: '**Draw a card.** Tap the board, then pick Draw.',
    },
    advance: 'action',
  },
  invite: {
    id: 'invite',
    anchor: { desktop: '[data-testid="room-link"]', phone: '[data-testid="room-link"]' },
    copy: {
      desktop: '**Invite a friend.** Copy the room link and send it over.',
      phone: '**Invite a friend.** Copy the room link and send it over.',
    },
    advance: 'action',
  },
  history: {
    id: 'history',
    // The only anchor that genuinely differs by layout: desktop floats an
    // ActionLogPanel; phone collapses it into a HUD toggle.
    anchor: {
      desktop: '[data-floating-panel="action-log"]',
      phone: '[data-testid="phone-hud-action-log-toggle"]',
    },
    copy: {
      desktop: 'Every move lands in your **action history**, right here.',
      phone: 'Every move lands in your **action history**, right here.',
    },
    advance: 'button',
  },
  'learn-more': {
    id: 'learn-more',
    anchor: { desktop: '[data-testid="deck-import-open"]', phone: '[data-testid="deck-import-open"]' },
    copy: {
      desktop: "That's it — you know how to play. Import your own deck whenever you're ready.",
      phone: "That's it — you know how to play. Import your own deck whenever you're ready.",
    },
    advance: 'button',
  },
};

/**
 * The A/B surface. Add a key here and add the matching variant to the
 * `onboarding-tour-step-order` PostHog flag — nothing else to wire up.
 *
 * Every order must list every step, or the omitted step silently disappears for
 * that arm and the funnel stops comparing like with like.
 */
export const STEP_ORDERS: Record<TourVariant, readonly TourStepId[]> = {
  control: ['play', 'tap', 'draw', 'invite', 'history', 'learn-more'],
  draw_first: ['draw', 'play', 'tap', 'invite', 'history', 'learn-more'],
};

export function stepsForVariant(variant: TourVariant): TourStep[] {
  return STEP_ORDERS[variant].map((id) => TOUR_STEPS[id]);
}
