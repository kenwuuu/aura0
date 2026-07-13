/**
 * Easing for peer-driven motion (live cursors, live drag ghosts).
 *
 * Awareness positions arrive at whatever rate the sender's frames and the
 * network hand them over — never evenly. Painting each one the moment it lands
 * makes remote motion read as choppy even when latency is low (the relay
 * measures ~13ms p50). Easing toward the newest position instead decouples what
 * we paint from when packets arrive, which is what makes remote motion look
 * continuous.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Time constant of the ease: the delay it costs us, and the jitter it buys back.
 * At 40ms a peer's cursor trails its true position by roughly one frame's worth
 * of travel — imperceptible — while still absorbing an arrival gap of several
 * frames without stuttering.
 */
const TAU_MS = 40;

/** Within this distance a position is close enough to stop animating toward it. */
const SETTLED_PX = 0.05;

/**
 * The fraction of the remaining distance to cover this frame. Exponential
 * rather than a fixed lerp so the ease is frame-rate independent: one long
 * frame catches up as much ground as the several short frames it replaced,
 * instead of falling progressively further behind on a slow machine.
 */
function easeFactor(dtMs: number): number {
  return 1 - Math.exp(-dtMs / TAU_MS);
}

/**
 * One frame of easing from `from` toward `to`. `settled` means the remaining
 * distance is below the point of visibility, so the caller can stop animating
 * (the returned point snaps exactly onto `to` so nothing is left dangling a
 * fraction of a pixel off).
 */
export function easePoint(from: Point, to: Point, dtMs: number): { point: Point; settled: boolean } {
  const k = easeFactor(dtMs);
  const x = from.x + (to.x - from.x) * k;
  const y = from.y + (to.y - from.y) * k;
  const settled = Math.abs(to.x - x) < SETTLED_PX && Math.abs(to.y - y) < SETTLED_PX;
  return settled ? { point: { x: to.x, y: to.y }, settled: true } : { point: { x, y }, settled: false };
}
