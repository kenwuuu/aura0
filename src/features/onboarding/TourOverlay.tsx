/**
 * The tour's only UI: a ring around the thing you should touch, and a card
 * telling you what to do with it.
 *
 * INVARIANT: the overlay never captures pointer events. Step 1 is a drag that
 * starts in the hand and ends on the board — two disjoint regions — so any
 * pointer-capturing surface between them eats the drop and deadlocks the tour on
 * a step the player is physically unable to complete. The root is
 * `pointer-events: none`; only the buttons opt back in.
 *
 * This is also why the coach mark isn't a Radix Popover: Radix's dismiss layer
 * and focus trap exist to make the rest of the page inert, which is the opposite
 * of what a coaching overlay wants (and `pointer-events: none` on `document.body`
 * is already a known footgun here — see the comment in Toolbar.tsx).
 */
import React from 'react';
import { usePhoneLayout } from '@/shared/hooks';
import { useAnchorRect } from './useAnchorRect';
import { useTourStore } from './tourStore';

/** Above the deck-import dialogs (10004), which are the highest thing in the app. */
const TOUR_Z_INDEX = 10500;

/** Breathing room between the ring and the element it surrounds. */
const RING_PADDING = 8;

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

function Spotlight({ rect }: { rect: DOMRect }) {
  return (
    <div
      aria-hidden
      className="tour-spotlight"
      style={{
        position: 'fixed',
        left: rect.left - RING_PADDING,
        top: rect.top - RING_PADDING,
        width: rect.width + RING_PADDING * 2,
        height: rect.height + RING_PADDING * 2,
        borderRadius: 12,
        pointerEvents: 'none',
      }}
    />
  );
}

export function TourOverlay() {
  const isPhone = usePhoneLayout();
  const active = useTourStore((s) => s.active);
  const steps = useTourStore((s) => s.steps);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const advance = useTourStore((s) => s.advance);
  const skip = useTourStore((s) => s.skip);

  const step = active ? steps[stepIndex] : undefined;
  const selector = step ? (isPhone ? step.anchor.phone : step.anchor.desktop) : null;
  // Hooks can't be conditional, so this runs even when there's no step — `active`
  // gates the loop inside.
  const rect = useAnchorRect(selector, active && !!step);

  if (!step) return null;

  return (
    <div
      data-testid="tour-overlay"
      data-tour-step={step.id}
      // The invariant. Do not change this to `auto`.
      style={{ position: 'fixed', inset: 0, zIndex: TOUR_Z_INDEX, pointerEvents: 'none' }}
    >
      {rect && <Spotlight rect={rect} />}

      <div
        role="dialog"
        aria-live="polite"
        aria-label="Onboarding tip"
        className="
          fixed left-1/2 -translate-x-1/2
          w-[min(28rem,calc(100vw-2rem))]
          rounded-xl border border-white/15 bg-neutral-900/95 shadow-2xl backdrop-blur
          px-4 py-3 text-sm text-neutral-300
        "
        // Sits below the toolbar (z-1000, top edge) and clear of the hand
        // (bottom edge), so it never covers a target or the drop zone.
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)', pointerEvents: 'none' }}
      >
        <p className="leading-snug">
          <Copy text={isPhone ? step.copy.phone : step.copy.desktop} />
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-neutral-500">
            {stepIndex + 1} / {steps.length}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="tour-skip"
              onClick={skip}
              // Buttons are the only things in here that take input.
              style={{ pointerEvents: 'auto' }}
              className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Skip
            </button>

            {step.advance === 'button' && (
              <button
                type="button"
                data-testid="tour-next"
                onClick={advance}
                style={{ pointerEvents: 'auto' }}
                className="rounded-md bg-white px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-200"
              >
                {stepIndex === steps.length - 1 ? 'Done' : 'Got it'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
