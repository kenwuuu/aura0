import { describe, it, expect } from 'vitest';
import type { BoardTimer } from './types';
import {
  DEFAULT_TIMER_MS,
  MAX_TIMER_MS,
  timerDisplay,
  startedTimer,
  pausedTimer,
  toggledTimer,
  resetTimerState,
  withMode,
  adjustedTimer,
  withDuration,
} from './timerLogic';

function makeTimer(overrides: Partial<BoardTimer> = {}): BoardTimer {
  return {
    id: 'timer-1',
    ownerId: 'p1',
    x: 0,
    y: 0,
    zIndex: 1,
    rotation: 0,
    mode: 'timer',
    running: false,
    startedAt: null,
    baseMs: DEFAULT_TIMER_MS,
    durationMs: DEFAULT_TIMER_MS,
    ...overrides,
  };
}

describe('timerDisplay', () => {
  it('shows a stopped timer at its base with no overtime', () => {
    const d = timerDisplay(makeTimer(), 0);
    expect(d).toMatchObject({ mm: '05', ss: '00', overtime: false });
  });

  it('rounds a running countdown UP so a fresh 5:00 never flashes 04:59', () => {
    // 500ms into a 5:00 countdown → 299_500ms remaining → ceil → 300s → 05:00.
    const t = makeTimer({ running: true, startedAt: 1000 });
    expect(timerDisplay(t, 1500)).toMatchObject({ mm: '05', ss: '00', overtime: false });
  });

  it('reaches 00:00 only at true expiry', () => {
    const t = makeTimer({ baseMs: 5000, running: true, startedAt: 0 });
    expect(timerDisplay(t, 4000)).toMatchObject({ mm: '00', ss: '01' }); // 1s left
    expect(timerDisplay(t, 5000)).toMatchObject({ mm: '00', ss: '00', overtime: false });
  });

  it('counts up in overtime once past zero, flagged as such', () => {
    const t = makeTimer({ baseMs: 1000, running: true, startedAt: 0 });
    const d = timerDisplay(t, 3000); // 2s past zero
    expect(d).toMatchObject({ mm: '00', ss: '02', overtime: true });
    expect(d.signedMs).toBeLessThan(0);
  });

  it('rounds a running stopwatch DOWN (elapsed)', () => {
    const t = makeTimer({ mode: 'stopwatch', baseMs: 0, running: true, startedAt: 0 });
    expect(timerDisplay(t, 4200)).toMatchObject({ mm: '00', ss: '04', overtime: false });
  });
});

describe('start / pause / toggle', () => {
  it('start anchors to now; pause freezes the remaining into base', () => {
    const started = startedTimer(makeTimer(), 1000);
    expect(started).toMatchObject({ running: true, startedAt: 1000 });

    const paused = pausedTimer(started, 4000); // 3s elapsed
    expect(paused.running).toBe(false);
    expect(paused.startedAt).toBeNull();
    expect(paused.baseMs).toBe(DEFAULT_TIMER_MS - 3000);
  });

  it('a start→pause→start→pause loses no time', () => {
    let t = startedTimer(makeTimer({ baseMs: 60_000 }), 0);
    t = pausedTimer(t, 10_000); // 50s left
    expect(t.baseMs).toBe(50_000);
    t = startedTimer(t, 100_000);
    t = pausedTimer(t, 120_000); // another 20s → 30s left
    expect(t.baseMs).toBe(30_000);
  });

  it('stopwatch pause accumulates elapsed into base', () => {
    let t = startedTimer(makeTimer({ mode: 'stopwatch', baseMs: 0 }), 0);
    t = pausedTimer(t, 7000);
    expect(t.baseMs).toBe(7000);
  });

  it('toggle flips running each call', () => {
    const t0 = makeTimer();
    const t1 = toggledTimer(t0, 0);
    expect(t1.running).toBe(true);
    const t2 = toggledTimer(t1, 1000);
    expect(t2.running).toBe(false);
  });
});

describe('reset', () => {
  it('returns a timer to its duration and stops', () => {
    const t = makeTimer({ baseMs: 12_000, durationMs: 300_000, running: true, startedAt: 0 });
    expect(resetTimerState(t)).toMatchObject({ running: false, startedAt: null, baseMs: 300_000 });
  });

  it('returns a stopwatch to zero', () => {
    const t = makeTimer({ mode: 'stopwatch', baseMs: 40_000, running: true, startedAt: 0 });
    expect(resetTimerState(t).baseMs).toBe(0);
  });
});

describe('withMode', () => {
  it('resets the clock to the new mode baseline on switch', () => {
    const running = makeTimer({ running: true, startedAt: 0, baseMs: 120_000 });
    const sw = withMode(running, 'stopwatch');
    expect(sw).toMatchObject({ mode: 'stopwatch', running: false, startedAt: null, baseMs: 0 });
  });

  it('is a no-op when the mode is unchanged', () => {
    const t = makeTimer();
    expect(withMode(t, 'timer')).toBe(t);
  });
});

describe('adjustedTimer', () => {
  it('at the baseline, nudges base AND duration so the change survives a reset', () => {
    const t = makeTimer({ baseMs: 300_000, durationMs: 300_000 });
    const up = adjustedTimer(t, 30_000, 0);
    expect(up.baseMs).toBe(330_000);
    expect(up.durationMs).toBe(330_000);
  });

  it('paused mid-count, nudges only the remaining — Reset still returns to the set length', () => {
    // Repro: started 5:00, paused at 3:29, +30s → shows 3:59 but the reset
    // target must stay 5:00, not become 3:59.
    const pausedMidRun = makeTimer({ baseMs: 209_000 /* 3:29 */, durationMs: 300_000 /* 5:00 */ });
    const nudged = adjustedTimer(pausedMidRun, 30_000, 0);
    expect(nudged.baseMs).toBe(239_000); // 3:59 shown
    expect(nudged.durationMs).toBe(300_000); // reset target untouched
    // A later Reset returns to the configured 5:00, not the mid-run 3:59.
    expect(resetTimerState(nudged).baseMs).toBe(300_000);
  });

  it('clamps to zero and never goes negative while stopped', () => {
    const t = makeTimer({ baseMs: 10_000, durationMs: 10_000 });
    const down = adjustedTimer(t, -30_000, 0);
    expect(down.baseMs).toBe(0);
    expect(down.durationMs).toBe(0);
  });

  it('shifts only the live remaining while running, keeping it running', () => {
    const t = makeTimer({ baseMs: 300_000, running: true, startedAt: 0 });
    const at = adjustedTimer(t, 30_000, 10_000); // 10s in → 290s left, +30 → 320s
    expect(at.running).toBe(true);
    // Live remaining at the same instant should read 320s.
    expect(timerDisplay(at, 10_000)).toMatchObject({ mm: '05', ss: '20' });
    // Reset baseline (duration) is untouched by a running adjust.
    expect(at.durationMs).toBe(300_000);
  });

  it('is a no-op for a stopwatch', () => {
    const t = makeTimer({ mode: 'stopwatch', baseMs: 0 });
    expect(adjustedTimer(t, 30_000, 0)).toBe(t);
  });
});

describe('withDuration', () => {
  it('sets an exact length, stops, switches to timer mode, and caps at the max', () => {
    const t = makeTimer({ mode: 'stopwatch', running: true, startedAt: 0 });
    const d = withDuration(t, 90_000);
    expect(d).toMatchObject({ mode: 'timer', running: false, startedAt: null, baseMs: 90_000, durationMs: 90_000 });

    expect(withDuration(t, MAX_TIMER_MS + 999_999).baseMs).toBe(MAX_TIMER_MS);
    expect(withDuration(t, -5).baseMs).toBe(0);
  });
});
