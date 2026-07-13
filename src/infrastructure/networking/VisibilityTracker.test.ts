/**
 * Unit tests for VisibilityTracker — the cases where wall-clock time and
 * *witnessed* time diverge: a backgrounded tab, a tab switched away mid-outage,
 * and the suspended machine that keeps reporting 'visible' while nobody is home.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisibilityTracker } from '@/infrastructure/networking/VisibilityTracker';

/** Flip the state, then announce it, the way the browser does. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('VisibilityTracker', () => {
  let tracker: VisibilityTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    tracker = new VisibilityTracker();
  });

  afterEach(() => {
    tracker.destroy();
    vi.useRealTimers();
  });

  it('counts a foreground outage as time the user sat and watched', () => {
    tracker.start();
    vi.advanceTimersByTime(30_000);

    expect(tracker.stop()).toBe(30_000);
  });

  it('counts nothing while the tab is in the background', () => {
    setVisibility('hidden');
    tracker.start();
    vi.advanceTimersByTime(30_000);

    expect(tracker.stop()).toBe(0);
  });

  it('counts only the part of the outage that was on screen', () => {
    tracker.start();
    vi.advanceTimersByTime(10_000); // watched it break...
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000); // ...then gave up and switched tabs

    expect(tracker.stop()).toBe(10_000);
  });

  it('resumes counting when the user comes back', () => {
    tracker.start();
    vi.advanceTimersByTime(5_000);
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    vi.advanceTimersByTime(5_000);

    expect(tracker.stop()).toBe(10_000);
  });

  it('does not credit a suspended machine as time on screen', () => {
    // A suspend is a clock jump with NO timers firing — advancing them would
    // mean the page was alive and ticking, the opposite of asleep. The tab stays
    // 'visible' throughout, so only the ticker's missed beats give it away.
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

    tracker.start();
    vi.advanceTimersByTime(1_000);
    vi.setSystemTime(Date.now() + THREE_DAYS); // the lid closes

    const visible = tracker.stop();

    expect(visible).toBeLessThan(10_000);
    expect(visible).not.toBeGreaterThanOrEqual(THREE_DAYS);
  });

  it('starts each episode from zero', () => {
    tracker.start();
    vi.advanceTimersByTime(10_000);
    tracker.stop();

    tracker.start();
    vi.advanceTimersByTime(2_000);

    expect(tracker.stop()).toBe(2_000);
  });

  it('stops accruing once destroyed', () => {
    tracker.start();
    vi.advanceTimersByTime(5_000);
    tracker.destroy();
    vi.advanceTimersByTime(60_000);

    expect(tracker.read()).toBe(5_000);
  });
});
