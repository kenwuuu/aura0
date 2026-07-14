/**
 * The tour content. This is the file you edit to change a tour.
 */
import type { TourStep, TourStepId, TourVariant } from './types';

const ROOM_LINK = '[data-testid="room-link"]';

export const TOUR_STEPS: Record<TourStepId, TourStep> = {
  // The three hand/board steps all park the bubble in the same place, above the
  // hand. Moving it between steps made the tour feel like it was chasing the
  // player around the screen; leaving it put means only the words change.
  play: {
    id: 'play',
    placement: 'aboveHand',
    copy: {
      desktop: '**Play a card.** Drag one onto the board.',
      // dnd-kit's TouchSensor needs a 300ms hold before the drag starts
      // (App.tsx), so "drag" on its own would be a lie on touch.
      phone: '**Play a card.** Long press, then drag onto the board.',
    },
    advance: 'action',
  },
  tap: {
    id: 'tap',
    placement: 'aboveHand',
    // Parked above the hand for continuity, but the action is on the *board* — a
    // tail aimed at the hand would be pointing at the wrong thing.
    tail: false,
    // There is no left-click-to-tap: tapping is the Space hotkey (routed by
    // hoverTarget) or the card's context menu. A board card is `menuFirst`, so on
    // touch a single tap opens that menu straight away — no preview first.
    copy: {
      desktop: '**Tap it.** Hover and press Space, or right-click and pick Tap.',
      phone: '**Tap it.** Zoom in, press it, then pick Tap.',
    },
    advance: 'action',
  },
  draw: {
    id: 'draw',
    placement: 'aboveHand',
    tail: false,
    // Tapping (touch) or right-clicking (desktop) the empty board opens the
    // Global menu, whose first entry is Draw — one-click access without panning
    // back to your deck. See BattlefieldCanvas's pane handlers.
    copy: {
      desktop: '**Draw a card.** Right-click the board, then pick Draw.',
      phone: '**Draw a card.** Tap the board, then pick Draw.',
    },
    advance: 'action',
  },
  invite: {
    id: 'invite',
    // The only step about one specific control, so the only one that leaves the
    // hand: it drops under the button and rings it.
    placement: 'belowAnchor',
    anchor: ROOM_LINK,
    halo: true,
    copy: {
      desktop: '**Invite a friend.** Go ahead, even if they\'re at work, you know it works on mobile.',
      phone: '**Invite a friend.** Go ahead, even if they\'re at work, you know it works on mobile.',
    },
    advance: 'action',
  },

  // Disabled: still defined, but deliberately in no order below. Put its id back
  // into STEP_ORDERS to bring it back.
  history: {
    id: 'history',
    placement: 'top',
    copy: {
      desktop: 'Every move lands in your **action history**, on the left.',
      phone: 'Every move lands in your **action history** — open it from the top-left.',
    },
    advance: 'button',
  },
};

/**
 * The A/B surface. Add a key here and add the matching variant to the
 * `onboarding-tour-step-order` PostHog flag — nothing else to wire up.
 *
 * Every order must list the same steps, or the omitted one silently disappears
 * for that arm and the funnel stops comparing like with like. (`history` is
 * absent from *all* of them, which is what "disabled" means — that is the one
 * legitimate way for a step to be missing.)
 */
export const STEP_ORDERS: Record<TourVariant, readonly TourStepId[]> = {
  control: ['play', 'tap', 'draw', 'invite'],
  draw_first: ['draw', 'play', 'tap', 'invite'],
};

export function stepsForVariant(variant: TourVariant): TourStep[] {
  return STEP_ORDERS[variant].map((id) => TOUR_STEPS[id]);
}
