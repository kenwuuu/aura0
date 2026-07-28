/**
 * Pure timer/stopwatch logic — no Yjs, no React, no `Date.now()` baked in (the
 * caller passes `now`). Every state transition returns a *new* `BoardTimer`, so
 * the Yjs writers in `spawnTimer.ts` can read → transform → write, and these
 * functions can be unit-tested in isolation.
 */
import type { BoardTimer, TimerMode } from './types';

/** On-board footprint (post-`zoom`, in flow units), used to center a new timer
 *  on the spawn point. The node renders at 224px wide then `zoom: 0.5` in
 *  TimerNode halves it — so its board footprint is ~112×~95. */
export const TIMER_WIDTH = 112;
export const TIMER_HEIGHT = 95;

export const DEFAULT_TIMER_MS = 5 * 60 * 1000; // 05:00
export const STEP_MS = 30 * 1000; // the ±30s buttons
/** Editing/adjust cap: 99:59. Stopwatches count up past this freely — only the
 *  configurable countdown length is bounded. */
export const MAX_TIMER_MS = 99 * 60 * 1000 + 59 * 1000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ms elapsed since the running anchor; 0 while paused. */
export function elapsedSinceAnchor(t: BoardTimer, now: number): number {
  return t.running && t.startedAt != null ? Math.max(0, now - t.startedAt) : 0;
}

export interface TimerDisplay {
  mm: string;
  ss: string;
  /** True only for a timer that has counted past zero. */
  overtime: boolean;
  /** Signed live value in ms (remaining for a timer — negative in overtime —,
   *  elapsed for a stopwatch). */
  signedMs: number;
}

/**
 * The clock face at time `now`. A running countdown rounds *up* to the whole
 * second (so a fresh 5:00 reads "05:00", not "04:59", and only hits "00:00" at
 * true expiry); a stopwatch and the overtime magnitude round *down* (a count-up
 * shows "00:00" until a full second has passed).
 */
export function timerDisplay(t: BoardTimer, now: number): TimerDisplay {
  const delta = elapsedSinceAnchor(t, now);

  if (t.mode === 'stopwatch') {
    const ms = t.baseMs + delta;
    const secs = Math.floor(ms / 1000);
    return { mm: pad2(Math.floor(secs / 60)), ss: pad2(secs % 60), overtime: false, signedMs: ms };
  }

  const remaining = t.baseMs - delta;
  if (remaining >= 0) {
    const secs = Math.ceil(remaining / 1000);
    return { mm: pad2(Math.floor(secs / 60)), ss: pad2(secs % 60), overtime: false, signedMs: remaining };
  }
  const secs = Math.floor(-remaining / 1000);
  return { mm: pad2(Math.floor(secs / 60)), ss: pad2(secs % 60), overtime: true, signedMs: remaining };
}

// ── Pure state transitions ────────────────────────────────────────────────────

export function startedTimer(t: BoardTimer, now: number): BoardTimer {
  if (t.running) return t;
  return { ...t, running: true, startedAt: now };
}

/** Freeze the live value into `baseMs` and stop. */
export function pausedTimer(t: BoardTimer, now: number): BoardTimer {
  if (!t.running) return t;
  const delta = elapsedSinceAnchor(t, now);
  const base = t.mode === 'timer' ? t.baseMs - delta : t.baseMs + delta;
  return { ...t, running: false, startedAt: null, baseMs: base };
}

export function toggledTimer(t: BoardTimer, now: number): BoardTimer {
  return t.running ? pausedTimer(t, now) : startedTimer(t, now);
}

/** Stop and return to the baseline: `durationMs` for a timer, 0 for a stopwatch. */
export function resetTimerState(t: BoardTimer): BoardTimer {
  const base = t.mode === 'timer' ? t.durationMs : 0;
  return { ...t, running: false, startedAt: null, baseMs: base };
}

/** Switch mode. A running countdown's remaining ms is meaningless read as
 *  elapsed (and vice-versa), so the clock is reset to the new mode's baseline. */
export function withMode(t: BoardTimer, mode: TimerMode): BoardTimer {
  if (t.mode === mode) return t;
  return resetTimerState({ ...t, mode });
}

/**
 * Nudge a timer by `deltaMs` (the ±30s buttons). No-op for a stopwatch, which
 * has no fixed length.
 *
 * The reset baseline (`durationMs`) only moves when you're configuring the
 * timer's length — i.e. it's sitting at that baseline (`baseMs === durationMs`,
 * so: fresh, or just reset). Once the clock has been started and paused
 * mid-count (`baseMs !== durationMs`), a nudge only adjusts the *remaining* time;
 * the reset target stays put, so Reset still returns to the length you set, not
 * to some mid-game adjustment. While running, likewise only the live remaining
 * shifts.
 */
export function adjustedTimer(t: BoardTimer, deltaMs: number, now: number): BoardTimer {
  if (t.mode !== 'timer') return t;
  if (t.running) {
    const elapsed = elapsedSinceAnchor(t, now);
    const nextRemaining = clamp(t.baseMs - elapsed + deltaMs, 0, MAX_TIMER_MS);
    // Re-anchor base so the live display equals nextRemaining while still running.
    return { ...t, baseMs: nextRemaining + elapsed };
  }
  const next = clamp(t.baseMs + deltaMs, 0, MAX_TIMER_MS);
  const atBaseline = t.baseMs === t.durationMs;
  return atBaseline ? { ...t, baseMs: next, durationMs: next } : { ...t, baseMs: next };
}

/** Set an exact countdown length (from editing the digits). Switches to timer
 *  mode, stops, and makes the new value the reset baseline. */
export function withDuration(t: BoardTimer, durationMs: number): BoardTimer {
  const ms = clamp(durationMs, 0, MAX_TIMER_MS);
  return { ...t, mode: 'timer', running: false, startedAt: null, baseMs: ms, durationMs: ms };
}
