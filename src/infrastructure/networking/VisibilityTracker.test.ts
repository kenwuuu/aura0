/**
 * Unit tests for VisibilityTracker.
 *
 * The tracker answers "how much of this outage did the user actually see", so
 * the cases that matter are the ones where wall-clock time and *witnessed* time
 * diverge: a backgrounded tab, a tab switched away mid-outage, and — the reason
 * the ticker exists at all — a suspended machine, which keeps reporting
 * `visibilityState: 'visible'` while nobody is home.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisibilityTracker } from '@/infrastructure/networking/VisibilityTracker';

/** Drive the page's visibility the way the browser does: flip the state, then announce it. */
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

    // Same 30s outage as above, and a complete non-event: nobody was looking.
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

    // Both foreground stretches, neither of the background one.
    expect(tracker.stop()).toBe(10_000);
  });

  it('does not credit a suspended machine as time on screen', () => {
    // The trap this class exists for. A laptop sleeps for three days with the
    // tab in the FOREGROUND: `visibilityState` stays 'visible' the whole time
    // because the page was never hidden — the machine simply stopped executing.
    // Naive wall-clock arithmetic would call that three days of rapt attention.
    //
    // A real suspend is modelled by jumping the clock WITHOUT running timers
    // (advancing timers would mean the page was alive and ticking, which is the
    // opposite of asleep). The ticker's missed beats are what give it away.
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

    tracker.start();
    vi.advanceTimersByTime(1_000); // one second of genuinely watching
    vi.setSystemTime(Date.now() + THREE_DAYS); // ...then the lid closes

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

    // The ticker is gone, so the abandoned episode cannot keep banking time.
    expect(tracker.read()).toBe(5_000);
  });
});
