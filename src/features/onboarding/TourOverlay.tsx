/**
 * The tour's only UI: a speech bubble that sits where the action is.
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
import { usePhoneLayout } from '@/shared/hooks';
import { useHandTop } from './useHandTop';
import { useTourStore } from './tourStore';

/** Above the deck-import dialogs (10004), which are the highest thing in the app. */
const TOUR_Z_INDEX = 10500;

/** Gap between the bubble's tail and the top of the hand. */
const TAIL_GAP = 14;

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
  const isPhone = usePhoneLayout();
  const active = useTourStore((s) => s.active);
  const steps = useTourStore((s) => s.steps);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const furthestIndex = useTourStore((s) => s.furthestIndex);
  const advance = useTourStore((s) => s.advance);
  const back = useTourStore((s) => s.back);
  const skip = useTourStore((s) => s.skip);

  const step = active ? steps[stepIndex] : undefined;
  const handTop = useHandTop(active && step?.placement === 'aboveHand');

  if (!step) return null;

  // Falls back to the top if the hand isn't there to point at.
  const aboveHand = step.placement === 'aboveHand' && handTop !== null;

  const position: React.CSSProperties = aboveHand
    ? { bottom: `calc(100vh - ${handTop! - TAIL_GAP}px)` }
    : { top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' };

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
      data-tour-placement={aboveHand ? 'aboveHand' : 'top'}
      // The invariant. Do not change this to `auto` — onboarding_tour.spec.ts
      // ("does not block the hand-to-board drag") fails immediately if you do.
      style={{ position: 'fixed', inset: 0, zIndex: TOUR_Z_INDEX, pointerEvents: 'none' }}
    >
      <div
        // A status message, not a dialog: it is non-modal, traps no focus, and
        // makes nothing else inert. Calling it a dialog would also make it a
        // second match for every `getByRole('dialog')` in the app and its tests.
        role="status"
        aria-live="polite"
        aria-label="Onboarding tip"
        data-testid="tour-bubble"
        className={`tour-bubble ${aboveHand ? 'tour-bubble--above-hand' : ''} fixed left-1/2 -translate-x-1/2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-neutral-900/95 px-4 py-3 text-sm text-neutral-300 shadow-2xl backdrop-blur`}
        style={{ ...position, pointerEvents: 'none' }}
      >
        <p className="leading-snug">
          <Copy text={isPhone ? step.copy.phone : step.copy.desktop} />
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
