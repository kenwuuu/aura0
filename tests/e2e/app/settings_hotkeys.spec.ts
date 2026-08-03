/**
 * Settings > Hotkeys: rebinding a key, switching preset, and resetting.
 *
 * The assertions are all "press the key, watch the game react", because the
 * failure this feature invites is a binding that *stores* correctly and never
 * fires. `serializeKeyEvent` has to reproduce react-hotkeys-hook's own
 * `event.code` normalization exactly; if it drifts, the Settings UI shows the
 * new key, the store holds the new key, and nothing happens when you press it.
 * Only a real keypress against a real board catches that.
 */
import { test, expect } from '../fixtures';
import {
  expectHandCount,
  handCards,
  helpButton,
  keysForAction,
  settingsButton,
  settingsNavButton,
} from '../harness';

/** Open Settings on the Hotkeys section. */
async function openHotkeySettings(page: import('@playwright/test').Page) {
  await settingsButton(page).click();
  await settingsNavButton(page, 'Hotkeys').click();
}

/** The capture control for an action, by its catalog short description. */
function captureButton(page: import('@playwright/test').Page, label: string) {
  return page.getByTestId(`hotkey-capture-${label}`);
}

async function closeSettings(page: import('@playwright/test').Page) {
  await page.keyboard.press('Escape');
  await expect(captureButton(page, 'Draw')).toBeHidden();
}

/** The opening hand size the fixture deals — read, not assumed. */
async function handSize(page: import('@playwright/test').Page): Promise<number> {
  return handCards(page).count();
}

test.describe('settings hotkeys', () => {
  test('a rebound key draws, and the old one stops', async ({ page }) => {
    const opening = await handSize(page);

    await openHotkeySettings(page);
    await captureButton(page, 'Draw').click();
    await page.keyboard.press('KeyQ');
    await expect(captureButton(page, 'Draw')).toHaveText('Q');
    await closeSettings(page);

    await page.keyboard.press('KeyQ');
    await expectHandCount(page, opening + 1);

    // The preset's own draw key must be dead now, or the rebind only *added* one.
    await page.keyboard.press(keysForAction('draw')[0]);
    await expectHandCount(page, opening + 1);
  });

  test('the key being recorded does not also play the game', async ({ page }) => {
    // Settings never sets isModalOpen, so board hotkeys are live inside it.
    // Recording the draw key must not draw a card as a side effect.
    const opening = await handSize(page);

    await openHotkeySettings(page);
    await captureButton(page, 'Draw').click();
    await page.keyboard.press(keysForAction('draw')[0]);

    await expectHandCount(page, opening);
  });

  test('resetting one key restores the preset binding', async ({ page }) => {
    const opening = await handSize(page);

    await openHotkeySettings(page);
    await captureButton(page, 'Draw').click();
    await page.keyboard.press('KeyQ');
    await expect(captureButton(page, 'Draw')).toHaveText('Q');

    await page.getByTestId('reset-hotkey-draw').click();
    await closeSettings(page);

    await page.keyboard.press(keysForAction('draw')[0]);
    await expectHandCount(page, opening + 1);
  });

  test('switching to the Untap preset moves the keys', async ({ page }) => {
    const opening = await handSize(page);

    await openHotkeySettings(page);
    await page.getByRole('combobox', { name: 'Keyboard scheme' }).click();
    await page.getByRole('option', { name: 'Untap' }).click();
    // Untap draws with C; the shipped Default preset draws with D.
    await expect(captureButton(page, 'Draw')).toHaveText('C');
    await closeSettings(page);

    await page.keyboard.press('KeyC');
    await expectHandCount(page, opening + 1);
  });

  test('a rebound key survives a reload', async ({ page }) => {
    const opening = await handSize(page);

    await openHotkeySettings(page);
    await captureButton(page, 'Draw').click();
    await page.keyboard.press('KeyQ');
    await expect(captureButton(page, 'Draw')).toHaveText('Q');

    await page.reload();
    await expectHandCount(page, opening);

    await page.keyboard.press('KeyQ');
    await expectHandCount(page, opening + 1);
  });

  test('the Help modal shows the key you actually press', async ({ page }) => {
    // The Shortcuts tab is generated, so it is the surface most likely to be
    // left reading catalog defaults instead of the player's bindings.
    await openHotkeySettings(page);
    await captureButton(page, 'Draw').click();
    await page.keyboard.press('KeyQ');
    await closeSettings(page);

    await helpButton(page).click();
    await page.getByRole('tab', { name: 'Shortcuts' }).click();

    const drawRow = page.getByRole('row').filter({ hasText: 'Draw' }).first();
    await expect(drawRow).toContainText('Q');
  });
});
