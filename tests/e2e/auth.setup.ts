import { expect, test as setup } from '@playwright/test';
import path from 'path';

const __dirname = import.meta.dirname;
const authFile = path.join(__dirname, '../../playwright/.auth/user.json');

setup('authenticate and save storage state', async ({ page }) => {
  // Navigate to the app with a specific room
  await page.goto('http://localhost:5173/?room=playwright');

  // Close any initial dialogs/modals
  await page.getByRole('button', { name: '× Close' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();

  // Wait for the app to be fully initialized
  // Check that the deck count is visible (indicates app is loaded)
  await expect(page.getByText('92')).toBeVisible();

  // Save the storage state (cookies, localStorage, sessionStorage)
  await page.context().storageState({ path: authFile });

  console.log(`Storage state saved to ${authFile}`);
});