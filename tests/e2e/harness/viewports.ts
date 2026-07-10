/**
 * Shared viewport presets for responsive specs. Responsive coverage sets the
 * viewport per spec with `page.setViewportSize` (see docs/responsive.md) —
 * the commented-out mobile device projects in playwright.config.ts stay
 * disabled because the rest of the suite is tuned for the default 1920×1080.
 */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
export const PHONE_VIEWPORT = { width: 390, height: 844 };
