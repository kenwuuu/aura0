/**
 * The tour's only UI: a speech bubble that sits where the action is, and — for
 * the one step that's about a specific button — a halo around that button.
 *
 * INVARIANT: the overlay never captures pointer events. The `play` step is a drag
 * that starts in the hand and ends on the board — two disjoint regions — so any
 * pointer-capturing surface between them eats the drop and deadlocks the tour on
 * a step the player is physically unable to complete. The root is
 * `pointer-events: none`; only the buttons opt back in.
 *
 * This is also why the bubble isn't a Radix Popover: Radix's dismiss layer and
 * focus trap exist to make the rest of the page inert, which is the opposite of
 * what a coaching overlay wants (and `pointer-events: none` on `document.body` is
 * already a known footgun here — see the comment in Toolbar.tsx).
 */
import React from 'react';
import { useElementRect, useViewportWidth } from './useElementRect';
import { useShowTouchCopy } from './useShowTouchCopy';
import { useTourStore } from './tourStore';

/** Above the deck-import dialogs (10004), which are the highest thing in the app. */
const TOUR_Z_INDEX = 10500;

/** Gap between the bubble's tail and whatever it points at. */
const TAIL_GAP = 14;

/** Breathing room between the halo and the control it rings. */
const HALO_PADDING = 6;

const MAX_WIDTH = 448; // 28rem

/**
 * Kept clear on each side. On a 390px phone this leaves the bubble at x 52–338,
 * which clears the two control columns running down the edges of the board — the
 * HUD ends at x≈42, and settings/zoom start at x≈348. Pinned by
 * onboarding_tour.spec.ts ("clears the board chrome").
 */
const SIDE_MARGIN = 52;

/** Only used by `top`-placed steps, none of which currently ship. */
const TOP_OFFSET = 132;

/** The hand *cards*, not their container — the container carries ~20px of padding
 * above them, and anchoring to it left the tail pointing at empty space. */
const HAND_CARDS = '[data-pile-type="hand"] [data-testid="hand-card"]';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Renders `**bold**` segments. The copy is one short line — not worth a markdown parser. */
function Copy({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith('**') && chunk.endsWith('**') ? (
          <strong key={i} className="font-semibold text-white">{chunk.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{chunk}</React.Fragment>
        ),
      )}
    </>
  );
}

export function TourOverlay() {
  const showTouchCopy = useShowTouchCopy();
  const viewportWidth = useViewportWidth();

  const active = useTourStore((s) => s.active);
  const steps = useTourStore((s) => s.steps);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const furthestIndex = useTourStore((s) => s.furthestIndex);
  const advance = useTourStore((s) => s.advance);
  const back = useTourStore((s) => s.back);
  const skip = useTourStore((s) => s.skip);

  const step = active ? steps[stepIndex] : undefined;

  // Hooks can't be conditional, so these run even with no step — `active` gates them.
  const handRect = useElementRect(HAND_CARDS, active && step?.placement === 'aboveHand');
  const anchorRect = useElementRect(
    step?.anchor ?? null,
    active && !!step?.anchor && (step.placement === 'belowAnchor' || !!step.halo),
  );

  if (!step) return null;

  const width = Math.min(MAX_WIDTH, viewportWidth - SIDE_MARGIN * 2);
  const centeredLeft = (viewportWidth - width) / 2;

  // Each placement degrades to a centered bubble with no tail if the thing it
  // wants to point at isn't on screen.
  let position: React.CSSProperties;
  let tail: 'up' | 'down' | null = null;
  let tailLeft = width / 2;
  let placement: string = step.placement;

  // A step can sit somewhere for continuity without pointing at it — `tap` and
  // `draw` stay parked above the hand so the bubble doesn't hop about, but their
  // actions happen on the board, so they show no tail.
  const wantsTail = step.tail !== false;

  if (step.placement === 'aboveHand' && handRect) {
    position = { left: centeredLeft, bottom: `calc(100vh - ${handRect.top - TAIL_GAP}px)` };
    if (wantsTail) tail = 'down';
  } else if (step.placement === 'belowAnchor' && anchorRect) {
    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    const left = clamp(anchorCenter - width / 2, SIDE_MARGIN, viewportWidth - width - SIDE_MARGIN);
    position = { left, top: anchorRect.bottom + TAIL_GAP };
    if (wantsTail) tail = 'up';
    // The bubble gets clamped inside the screen, but the tail still has to point
    // at the button — so it slides along the bubble's edge instead of sitting in
    // the middle of it. Kept off the rounded corners.
    tailLeft = clamp(anchorCenter - left, 16, width - 16);
  } else {
    position = { left: centeredLeft, top: `calc(env(safe-area-inset-top, 0px) + ${TOP_OFFSET}px)` };
    placement = 'top';
  }

  // Reviewing a step already passed: the game must not auto-advance us out of it
  // again, so paging forward is the player's job. (An informational step always
  // needs its button, done or not.)
  const isReviewing = stepIndex < furthestIndex;
  const showNext = isReviewing || step.advance === 'button';
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div
      data-testid="tour-overlay"
      data-tour-step={step.id}
      data-tour-placement={placement}
      data-tour-tail={tail ?? 'none'}
      // The invariant. Do not change this to `auto` — onboarding_tour.spec.ts
      // ("does not block the hand-to-board drag") fails immediately if you do.
      style={{ position: 'fixed', inset: 0, zIndex: TOUR_Z_INDEX, pointerEvents: 'none' }}
    >
      {step.halo && anchorRect && (
        <div
          aria-hidden
          data-testid="tour-halo"
          className="tour-halo"
          style={{
            position: 'fixed',
            left: anchorRect.left - HALO_PADDING,
            top: anchorRect.top - HALO_PADDING,
            width: anchorRect.width + HALO_PADDING * 2,
            height: anchorRect.height + HALO_PADDING * 2,
            borderRadius: 10,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        // A status message, not a dialog: it is non-modal, traps no focus, and
        // makes nothing else inert. Calling it a dialog would also make it a
        // second match for every `getByRole('dialog')` in the app and its tests.
        role="status"
        aria-live="polite"
        aria-label="Onboarding tip"
        data-testid="tour-bubble"
        className={`tour-bubble ${tail ? `tour-bubble--tail-${tail}` : ''} fixed rounded-xl border border-white/15 bg-neutral-900/95 px-4 py-3 text-sm text-neutral-300 shadow-2xl backdrop-blur`}
        style={
          {
            ...position,
            width,
            pointerEvents: 'none',
            '--tour-tail-left': `${tailLeft}px`,
          } as React.CSSProperties
        }
      >
        <p className="leading-snug">
          <Copy text={showTouchCopy ? step.copy.phone : step.copy.desktop} />
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-neutral-500">
            {stepIndex + 1} / {steps.length}
          </span>

          {/* Buttons are the only things in here that take input. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="tour-skip"
              onClick={skip}
              style={{ pointerEvents: 'auto' }}
              className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
            >
              Skip
            </button>

            {stepIndex > 0 && (
              <button
                type="button"
                data-testid="tour-back"
                onClick={back}
                style={{ pointerEvents: 'auto' }}
                className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Back
              </button>
            )}

            {showNext && (
              <button
                type="button"
                data-testid="tour-next"
                onClick={advance}
                style={{ pointerEvents: 'auto' }}
                className="rounded-md bg-white px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-200"
              >
                {/* Not "Got it" — that string already belongs to
                    DeckImportHelpDialog, and the e2e fixture clicks it blind. */}
                {isLastStep && !isReviewing ? 'Done' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
