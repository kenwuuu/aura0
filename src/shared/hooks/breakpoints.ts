/**
 * Breakpoint constants shared between CSS and JS. These mirror Tailwind v4's
 * default breakpoint scale so a JS media-query check (`useMediaQuery`) and a
 * Tailwind `sm:`/`md:` class always agree on where the line is. If this
 * project ever customizes Tailwind's `--breakpoint-*` theme values, update
 * this file to match.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** A `min-width` media query string for the given breakpoint, e.g. `'(min-width: 768px)'`. */
export function minWidthQuery(breakpoint: Breakpoint): string {
  return `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
}
