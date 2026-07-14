import { useEffect, useState } from 'react';

/**
 * The live screen rect of a tour anchor, or null if it isn't on screen.
 *
 * Measured on a rAF loop rather than from resize/scroll events, because the most
 * important anchors (board cards, piles) are react-flow nodes inside
 * `.react-flow__viewport` — a CSS-transformed container that emits no scroll
 * event when it pans or zooms. Anything event-driven goes stale the moment the
 * player moves the board. The loop runs only while the tour is up, and only
 * re-renders when the rect actually changes, so a still board costs nothing.
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
      const next = document.querySelector(selector)?.getBoundingClientRect() ?? null;
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
