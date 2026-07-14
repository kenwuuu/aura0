import { useEffect, useState } from 'react';

/**
 * The live screen rect of the element `selector` matches, or null if it isn't there.
 *
 * Event-driven, not a rAF loop: every element the tour anchors to — the hand, the
 * toolbar's room-link button — is `position: fixed` against a screen edge, so it
 * moves only when it *resizes* (hand zoom, rotation, window resize). A
 * ResizeObserver plus a resize listener catches all of those. (A react-flow node
 * would need per-frame measurement, because the board's CSS transform moves it
 * without firing anything; nothing the tour points at lives in there.)
 */
export function useElementRect(selector: string | null, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }

    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }

    const measure = () => setRect(el.getBoundingClientRect());
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [selector, active]);

  return rect;
}

/** Viewport width, for clamping the bubble inside the screen. */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const measure = () => setWidth(window.innerWidth);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return width;
}
