/**
 * Advisory coverage for the phone HUD layout (docs/responsive.md): below the
 * `sm` breakpoint the draggable HUD windows are replaced by a fixed top-left
 * toggle column (PhoneHudStack), and the settings gear + zoom controls move
 * to the top-right. Desktop keeps the floating panels. Untagged (not @smoke),
 * like toolbar_responsive.spec.ts.
 */
import { test, expect } from '../fixtures';
import {
  toolbar,
  floatingPanel,
  gameActionsContent,
  phoneHudGameActionsToggle,
  phoneHudActionLogToggle,
  settingsButton,
  zoomControls,
  DESKTOP_VIEWPORT,
  PHONE_VIEWPORT,
} from '../harness';

test.describe('phone HUD', () => {
  test('phone width replaces the draggable panels with working top-left toggles', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);

    // The desktop floating windows are gone entirely — nothing to drag.
    await expect(floatingPanel(page, 'game-actions-toolbar')).not.toBeVisible();
    await expect(floatingPanel(page, 'action-log')).not.toBeVisible();

    // Both toggles sit in the top-left column, below the top menu bar.
    const actionsToggle = phoneHudGameActionsToggle(page);
    const logToggle = phoneHudActionLogToggle(page);
    await expect(actionsToggle).toBeVisible();
    await expect(logToggle).toBeVisible();
    const toolbarBox = await toolbar(page).boundingBox();
    const actionsBox = await actionsToggle.boundingBox();
    const logBox = await logToggle.boundingBox();
    expect(actionsBox!.x).toBeLessThan(60);
    expect(actionsBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
    expect(logBox!.y).toBeGreaterThan(actionsBox!.y);

    // Game actions expand out of their toggle and collapse again.
    await expect(gameActionsContent(page)).not.toBeVisible();
    await actionsToggle.click();
    await expect(gameActionsContent(page)).toBeVisible();
    await expect(floatingPanel(page, 'game-actions-toolbar')).not.toBeVisible();
    await actionsToggle.click();
    await expect(gameActionsContent(page)).not.toBeVisible();

    // The action log does the same (its uppercase header label marks it open).
    await logToggle.click();
    await expect(page.getByText('Action Log')).toBeVisible();
    await logToggle.click();
    await expect(page.getByText('Action Log')).not.toBeVisible();
  });

  test('phone width moves settings and zoom controls to the top-right', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);

    const settingsBox = await settingsButton(page).boundingBox();
    const zoomBox = await zoomControls(page).boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(zoomBox).not.toBeNull();

    // Right half, upper third; zoom controls stacked below the gear.
    expect(settingsBox!.x).toBeGreaterThan(PHONE_VIEWPORT.width / 2);
    expect(settingsBox!.y).toBeLessThan(PHONE_VIEWPORT.height / 3);
    expect(zoomBox!.x).toBeGreaterThan(PHONE_VIEWPORT.width / 2);
    expect(zoomBox!.y).toBeGreaterThan(settingsBox!.y);
  });

  test('desktop width keeps the floating panels and bottom-left controls', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await expect(floatingPanel(page, 'game-actions-toolbar')).toBeVisible();
    await expect(floatingPanel(page, 'action-log')).toBeVisible();
    await expect(phoneHudGameActionsToggle(page)).not.toBeVisible();
    await expect(phoneHudActionLogToggle(page)).not.toBeVisible();

    const settingsBox = await settingsButton(page).boundingBox();
    expect(settingsBox!.x).toBeLessThan(DESKTOP_VIEWPORT.width / 2);
    expect(settingsBox!.y).toBeGreaterThan(DESKTOP_VIEWPORT.height / 2);
  });
});
