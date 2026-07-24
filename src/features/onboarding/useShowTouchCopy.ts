/**
 * Whether the tour should show its **touch** copy ("tap the card", "long press")
 * rather than its **mouse** copy ("hover and press Space", "right-click").
 *
 * The single source of truth for that decision, consumed by both the overlay
 * (which copy to render) and the progress hook (the `layout` analytics label) so
 * the two can never disagree — a device seeing touch copy must be logged as
 * `phone`, or the funnel lies about what the player read.
 *
 * Gated on input capability, not just width. Width alone (`usePhoneLayout()`)
 * left touch tablets and landscape phones — wider than the phone breakpoint but
 * with no hover, no right-click, no keys — reading mouse-only instructions. The
 * `pointer: coarse` term catches those; the width term is kept so a portrait
 * phone that under-reports its pointer still gets touch copy.
 */
import { useCoarsePointer, usePhoneLayout } from '@/shared/hooks';

export function useShowTouchCopy(): boolean {
  // Both hooks must be called unconditionally every render — a `usePhoneLayout()
  // || useCoarsePointer()` one-liner would short-circuit the *second hook call*
  // whenever the first is true, changing the hook count as the viewport crosses
  // the phone breakpoint and scrambling React's positional hook state on resize.
  const isPhoneWidth = usePhoneLayout();
  const isTouchPointer = useCoarsePointer();
  return isPhoneWidth || isTouchPointer;
}
