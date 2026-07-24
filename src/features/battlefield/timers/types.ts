import type { WhiteboardObject } from '@/features/battlefield/types';

export type TimerMode = 'timer' | 'stopwatch';

/**
 * A shared board clock — a countdown ('timer') or a count-up ('stopwatch').
 *
 * The displayed time is *derived*, never stored: every peer computes it from
 * `Date.now()` and the fields below, so a running clock needs no periodic Yjs
 * writes to stay in sync. Only discrete user actions (start/pause/reset/adjust/
 * mode switch/edit) write the doc.
 *
 * Semantics of the two running-state fields:
 *  - `startedAt` — epoch ms when the clock was last started/resumed; `null`
 *    while paused. `running` and a non-null `startedAt` always travel together.
 *  - `baseMs` — the frozen value captured at the last pause: *remaining* ms for
 *    a timer, *elapsed* ms for a stopwatch. While running, the live value is
 *    `baseMs ∓ (now - startedAt)` (minus for a timer, plus for a stopwatch).
 *
 * Like every board object, ownership gates nothing: `ownerId` is the creator
 * (used only for the action-log wording); anyone at the table may control it.
 */
export interface BoardTimer extends WhiteboardObject {
  mode: TimerMode;
  running: boolean;
  /** Epoch ms anchor set on start/resume; null while paused. */
  startedAt: number | null;
  /** Remaining ms (timer) / elapsed ms (stopwatch), frozen at the last pause. */
  baseMs: number;
  /** Countdown length Reset returns a timer to (ms). Ignored for stopwatch. */
  durationMs: number;
}
