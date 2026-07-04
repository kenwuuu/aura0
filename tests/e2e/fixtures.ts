import {test as base, expect, Locator} from '@playwright/test';
import { blockAnalytics, forceWebRtcTransport } from './harness/network';

async function closeIfVisible(locator: Locator) {
  // Only try the click if the locator exists in the DOM
  if (await locator.isVisible().catch(() => false)) {
    await locator.click({ trial: true }).catch(() => {});
    await locator.click();
    await locator.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  }
}

// Random string generator to avoid running into any real game rooms
function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export const test = base.extend({
  page: async ({ page }, use) => {

    await blockAnalytics(page);
    await forceWebRtcTransport(page);
    await page.goto(`/?room=${generateRandomString(30)}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());

    // Close modals using your helper (in proper order)
    await closeIfVisible(page.getByRole('button', { name: '× Close' }));
    await closeIfVisible(page.getByRole('button', { name: 'Got it' }));

    // Wait until the app is fully ready: default deck loaded (40 health, 8-card
    // opening hand). `#local-dock` no longer exists post-board-redesign — health
    // and hand cards are now react-flow board nodes (see tests/e2e/harness/).
    await expect(page.getByTestId('health-value')).toHaveValue('40');
    await expect(page.locator('[data-testid="hand-card"]')).toHaveCount(8);

    // Provide the prepared page to the test
    await use(page);
  },
});

export { expect };