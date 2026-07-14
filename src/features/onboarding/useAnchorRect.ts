import { useEffect, useState } from 'react';

/**
 * The rect of the on-screen element a step points at, or null if there isn't one.
 *
 * "On-screen" is the whole job. A selector like `[data-testid="hand-card"]`
 * matches all eight cards in the hand, and `querySelector` would hand back the
 * first in *DOM order* — which, on a phone, is scrolled several hundred pixels
 * off the left edge. The ring would be drawn at x=-553 and the player would see a
 * coach mark pointing at nothing. So: among the matches, take the visible one
 * nearest the middle of the screen, and if none is visible, say so (the step then
 * renders anchorless rather than ringing empty space).
 */
function resolveAnchorRect(selector: string): DOMRect | null {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const middle = viewportW / 2;

  let best: DOMRect | null = null;
  let bestDistance = Infinity;

  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    if (cx < 0 || cy < 0 || cx > viewportW || cy > viewportH) continue;

    const distance = Math.abs(cx - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = rect;
    }
  }

  return best;
}

/**
 * Re-measured on a rAF loop rather than from resize/scroll events, because the
 * anchors that matter most (board cards, piles) are react-flow nodes inside
 * `.react-flow__viewport` — a CSS-transformed container that fires **no scroll
 * event** when it pans or zooms, so anything event-driven goes stale the moment
 * the player moves the board. The same is true of the hand, which scrolls
 * horizontally under the player's thumb.
 *
 * The loop runs only while the tour is up, and only re-renders when the rect
 * actually changes, so a still board costs one rect read per frame.
 */
export function useAnchorRect(selector: string | null, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let lastKey = '';

    const measure = () => {
      const next = resolveAnchorRect(selector);
      const key = next ? `${next.x},${next.y},${next.width},${next.height}` : '';
      if (key !== lastKey) {
        lastKey = key;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [selector, active]);

  return rect;
}
