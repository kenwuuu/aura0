/**
 * Settings > Profile: the identity fields, which are the first settings that
 * write through `Player` to shared state rather than to the local settings
 * store.
 *
 * Both assertions are about surviving a reload, because that's the failure
 * these controls invite: Player's constructor reseeds its own name and color
 * into Yjs on every boot, so a picker that only wrote to Yjs would look
 * correct until the page reloaded and then silently revert. Unit tests cover
 * the Player contract; this covers the whole round trip through a real
 * IndexedDB-backed doc.
 */
import { test, expect } from '../fixtures';
import { settingsButton, playerNameInput, playerColorInput } from '../harness';

test.describe('settings profile', () => {
  test('a renamed player keeps the name across a reload', async ({ page }) => {
    await settingsButton(page).click();
    await playerNameInput(page).fill('Nissa');
    await playerNameInput(page).blur();

    await page.reload();
    await settingsButton(page).click();

    await expect(playerNameInput(page)).toHaveValue('Nissa');
  });

  test('a picked color keeps its value across a reload', async ({ page }) => {
    await settingsButton(page).click();

    // `fill` is the supported way to drive a color input — assigning `.value`
    // directly updates React's change tracker and silently skips onChange, so
    // the DOM would show the new color while nothing was ever saved.
    await playerColorInput(page).fill('#ff8800');
    await expect(playerColorInput(page)).toHaveValue('#ff8800');

    await page.reload();
    await settingsButton(page).click();

    await expect(playerColorInput(page)).toHaveValue('#ff8800');
  });
});
