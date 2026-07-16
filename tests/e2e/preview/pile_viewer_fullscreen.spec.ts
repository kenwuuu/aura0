import { test, expect } from '../fixtures';
import { openPileViewer, pileViewer, waitForPileViewerReady } from '../harness';

/**
 * Runs ONLY under `playwright.preview.config.ts` (production build served by
 * `vite preview`), at a phone viewport. On the dev bundle this passes trivially
 * — the point is the *minified* CSS.
 *
 * Regression guard: Lightning CSS folded the phone shell's
 * `transform: none; translate: none` reset into `transform: translate(0)`,
 * dropping the `translate` reset, so the full-screen modal stayed shifted by
 * the dialog's centering `translate: -50% -50%` and slid mostly off-screen
 * (only its bottom-right corner visible). If the reset is ever lost again this
 * fails, because the shell no longer sits at the top-left origin.
 */
test(
  'deck pile viewer fills the phone viewport on the production build',
  { tag: '@smoke' },
  async ({ page }) => {
    await openPileViewer(page, 'deck');
    await expect(pileViewer(page, 'deck')).toBeVisible();
    await waitForPileViewerReady(page);

    const modal = pileViewer(page, 'deck');
    // The dialog's open animation is a zoom; let it settle before measuring.
    await expect(modal).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('No viewport size set.');

    const box = await modal.boundingBox();
    if (!box) throw new Error('Pile viewer has no bounding box (not rendered).');

    // The centering translate must be neutralized on the full-screen phone
    // shell; a surviving `-50% -50%` is exactly the dropped-reset failure.
    await expect(modal).toHaveCSS('translate', 'none');

    // Sits at the top-left origin and covers the viewport (allow 1px rounding;
    // height is 100dvh, which can exceed the layout viewport slightly).
    expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2);
  },
);
