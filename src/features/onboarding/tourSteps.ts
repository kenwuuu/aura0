/**
 * The tour content. This is the file you edit to change a tour.
 */
import type { TourStep, TourStepId, TourVariant } from './types';

export const TOUR_STEPS: Record<TourStepId, TourStep> = {
  play: {
    id: 'play',
    // The only step whose action happens in the hand, so the only one that sits
    // down there — with a tail pointing at the cards it's talking about.
    placement: 'aboveHand',
    copy: {
      desktop: '**Play a card.** Drag one up onto the board.',
      // dnd-kit's TouchSensor needs a 300ms hold before the drag starts
      // (App.tsx), so "drag" on its own would be a lie on touch.
      phone: '**Play a card.** Long press, then drag it up onto the board.',
    },
    advance: 'action',
  },
  tap: {
    id: 'tap',
    placement: 'top',
    // There is no left-click-to-tap: tapping is the Space hotkey (routed by
    // hoverTarget) or the card's context menu. A board card is `menuFirst`, so on
    // touch a single tap opens that menu straight away — no preview first.
    copy: {
      desktop: '**Tap it.** Hover card and press Space, or right-click it and pick Tap.',
      phone: '**Tap it.** Tap the card you just played, then pick Tap.',
    },
    advance: 'action',
  },
  draw: {
    id: 'draw',
    placement: 'top',
    // Tapping (touch) or right-clicking (desktop) empty board opens the Global
    // menu, whose first entry is Draw — one-click access without panning back to
    // your deck. See BattlefieldCanvas's pane handlers.
    copy: {
      desktop: '**Draw a card.** Right-click the board, then pick Draw.',
      phone: '**Draw a card.** Tap the board, then pick Draw.',
    },
    advance: 'action',
  },
  invite: {
    id: 'invite',
    placement: 'top',
    copy: {
      desktop: '**Invite a friend.** Copy the room link and send it over.',
      phone: '**Invite a friend.** Copy the room link and send it over.',
    },
    advance: 'action',
  },
  history: {
    id: 'history',
    placement: 'top',
    copy: {
      desktop: 'Every move lands in your **action history**, on the left.',
      phone: 'Every move lands in your **action history** — open it from the top-left.',
    },
    advance: 'button',
  },
  'learn-more': {
    id: 'learn-more',
    placement: 'top',
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
