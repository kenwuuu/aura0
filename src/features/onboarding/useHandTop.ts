import { useEffect, useState } from 'react';

/**
 * The y-coordinate of the top of the player's hand, so the coach mark can sit
 * just above it.
 *
 * The hand is a `position: fixed` element pinned to the bottom edge
 * (FloatingHand), so its top edge only moves when its *height* changes — a zoom
 * change, a rotation, a resize. A ResizeObserver catches all three. This replaces
 * an earlier per-frame rAF loop: the hand doesn't move under a pan or a zoom of
 * the board the way a react-flow node does, so measuring it 60 times a second was
 * paying for nothing.
 *
 * Returns null if the hand isn't in the DOM, in which case the caller should fall
 * back to a placement that doesn't depend on it.
 */
export function useHandTop(active: boolean): number | null {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setTop(null);
      return;
    }

    const hand = document.querySelector('[data-pile-type="hand"]');
    if (!hand) {
      setTop(null);
      return;
    }

    // The *cards*, not the container: the container carries ~20px of padding
    // above them, and anchoring to it left the bubble visibly floating clear of
    // the cards it was pointing at. Every card shares a top edge, so the first
    // one in the DOM is fine even when the hand is scrolled sideways. Falls back
    // to the container before any cards exist.
    const measure = () => {
      const card = hand.querySelector('[data-testid="hand-card"]');
      setTop((card ?? hand).getBoundingClientRect().top);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(hand);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active]);

  return top;
}
