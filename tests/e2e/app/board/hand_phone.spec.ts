/**
 * Advisory coverage for the phone hand (docs/architecture/responsive.md): below the `sm`
 * breakpoint the hand strip spans the full viewport width and the rendered
 * card zoom is capped (effectiveHandZoom) so several cards fit the screen.
 * The default handZoom of 1 already exceeds the 0.6 phone cap, so the card
 * width proves the clamp: ~113px clamped vs ~189px unclamped. Untagged (not
 * @smoke), like toolbar_responsive.spec.ts.
 */
import { test, expect } from '../../fixtures';
import { handCard, handCardsContainer, DESKTOP_VIEWPORT, PHONE_VIEWPORT } from '../../harness';

test.describe('phone hand', () => {
  test('phone width: hand spans edge-to-edge and cards render clamped', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);

    const containerBox = await handCardsContainer(page).boundingBox();
    expect(containerBox).not.toBeNull();
    expect(containerBox!.x).toBeLessThanOrEqual(1);
    expect(containerBox!.width).toBeGreaterThanOrEqual(PHONE_VIEWPORT.width - 2);

    // 3 × 63px × 0.6 cap ≈ 113px — well under the unclamped ~189px.
    const cardBox = await handCard(page).boundingBox();
    expect(cardBox!.width).toBeGreaterThan(100);
    expect(cardBox!.width).toBeLessThan(125);
  });

  test('desktop width: hand keeps the centered strip and unclamped zoom', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    // 3 × 63px × zoom 1 = 189px.
    const cardBox = await handCard(page).boundingBox();
    expect(cardBox!.width).toBeGreaterThan(180);
    expect(cardBox!.width).toBeLessThan(200);

    // Centered, not edge-to-edge: clear margin on the left side.
    const containerBox = await handCardsContainer(page).boundingBox();
    expect(containerBox!.x).toBeGreaterThan(50);
  });
});
