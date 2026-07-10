import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, usePhoneLayout } from './useMediaQuery';

/** A minimal fake MediaQueryList: tracks the single registered listener and
 * lets the test flip `matches` and fire a synthetic `change` event. */
function makeMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  let listener: ((event: { matches: boolean }) => void) | null = null;
  const addEventListener = vi.fn((_: string, cb: typeof listener) => { listener = cb; });
  const removeEventListener = vi.fn((_: string, cb: typeof listener) => {
    if (listener === cb) listener = null;
  });

  return {
    get matches() { return matches; },
    addEventListener,
    removeEventListener,
    change(next: boolean) {
      matches = next;
      listener?.({ matches });
    },
  };
}

describe('useMediaQuery', () => {
  let mql: ReturnType<typeof makeMatchMedia>;

  beforeEach(() => {
    mql = makeMatchMedia(false);
    vi.stubGlobal('matchMedia', vi.fn(() => mql));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reflects the current match state on initial render', () => {
    mql = makeMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn(() => mql));

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('updates when the media query match state changes', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      mql.change(true);
    });

    expect(result.current).toBe(true);
  });

  it('subscribes and unsubscribes exactly one change listener across mount/unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('usePhoneLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries the sm breakpoint and inverts it: phone when narrower', () => {
    const matchMedia = vi.fn(() => makeMatchMedia(false));
    vi.stubGlobal('matchMedia', matchMedia);

    const { result } = renderHook(() => usePhoneLayout());

    // Below sm → min-width query doesn't match → phone layout.
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 640px)');
    expect(result.current).toBe(true);
  });

  it('is false at or above the sm breakpoint', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => makeMatchMedia(true)));

    const { result } = renderHook(() => usePhoneLayout());

    expect(result.current).toBe(false);
  });
});
