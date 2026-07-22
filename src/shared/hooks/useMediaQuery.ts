/**
 * useMediaQuery — subscribes to a `window.matchMedia` query and re-renders
 * when it flips. Built on `useSyncExternalStore` so the initial render is
 * already correct (no flash-of-wrong-layout on mount) and there's no tearing
 * between concurrent renders.
 *
 * Prefer CSS (`@media` / Tailwind `sm:`/`md:`) for pure show/hide — it has no
 * JS cost and no hydration-mismatch risk. Reach for this hook only when a
 * real JS branch is required: a different component tree, a portal target,
 * or behavior (not just visibility) that depends on viewport size.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { minWidthQuery, type Breakpoint } from './breakpoints';

/** Subscribes to an arbitrary media query string, e.g. `'(min-width: 768px)'`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // No SSR path in this app today; the server snapshot is a static default.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True once the viewport is at least as wide as the given Tailwind breakpoint. */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(minWidthQuery(breakpoint));
}

/**
 * True below the `sm` breakpoint — the app's single "phone layout" line.
 * Use this (not ad-hoc widths) for JS structural branches: a different
 * component tree, react-flow props, disabling drag. Pure show/hide belongs
 * in CSS instead. Full contract: docs/architecture/responsive.md.
 */
export function usePhoneLayout(): boolean {
  return !useBreakpoint('sm');
}
