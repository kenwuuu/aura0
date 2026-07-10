/**
 * pointerInput — a standing "what was the last input modality" signal.
 *
 * The codebase already knows the pointer type of any *individual* event
 * (`e.pointerType`) and roughly infers a phone via width (`usePhoneLayout`),
 * but nothing tracks the last input modality across events. Touch interactions
 * need that: the card-preview surfaces listen on `onMouseEnter`, and a touch
 * tap fires a *synthetic* `mouseenter` with no matching `mouseleave` on
 * finger-lift. Left ungated, that synthetic hover fights the tap-driven
 * preview. Gating those hover handlers on `wasLastInputTouch()` makes hover
 * inert on touch, so taps are the single source of truth for the preview.
 *
 * One capture-phase, passive listener each for `pointerdown` and `pointermove`
 * records the latest `pointerType`. It is installed lazily on first import
 * (side-effect import at app boot in `src/app/App.tsx`) and defaults to
 * `'mouse'` so desktop is correct before any pointer has moved.
 *
 * Ordering note: touch's trailing legacy-compat events (`mouseenter` /
 * `mousemove`) are `MouseEvent`s, not `PointerEvent`s, so they never reach
 * these listeners and never flip the signal back to `'mouse'` before the
 * synthetic `mouseenter` fires — that ordering is what makes suppression
 * reliable.
 */

let lastPointerType = 'mouse';
let installed = false;

function record(e: PointerEvent): void {
  // Some environments report an empty string for synthetic pointers; fall back
  // to 'mouse' so the signal only ever reads a real modality.
  lastPointerType = e.pointerType || 'mouse';
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', record, { capture: true, passive: true });
  window.addEventListener('pointermove', record, { capture: true, passive: true });
}

install();

/** The `pointerType` of the most recent pointer event ('mouse' | 'touch' | 'pen'). */
export function getLastPointerType(): string {
  return lastPointerType;
}

/** True when the last pointer interaction came from a touch. */
export function wasLastInputTouch(): boolean {
  return lastPointerType === 'touch';
}

/** Test seam: force the recorded modality without dispatching real events. */
export function __setLastPointerTypeForTest(t: string): void {
  lastPointerType = t;
}
