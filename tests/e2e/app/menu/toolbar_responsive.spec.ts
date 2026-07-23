/**
 * Advisory coverage for the top menu bar's responsive collapse
 * (src/app/Toolbar.tsx). Below the 640px `sm` breakpoint: the ⌘K launcher
 * disappears, Help/Discord move into the "⋯ More" overflow menu, the
 * connection status collapses to its dot, and the new-game/copy-link buttons
 * go icon-only. Untagged (not @smoke) per docs/testing/e2e.md — responsive
 * layout isn't a load-bearing subsystem.
 */
import { test, expect } from '../../fixtures';
import {
  toolbar,
  toolbarMoreButton,
  commandPaletteButton,
  helpButton,
  discordButton,
  kofiButton,
  connectionStatus,
  roomLinkButton,
  newGameButton,
  deckImportOpenButton,
  DESKTOP_VIEWPORT,
  PHONE_VIEWPORT,
} from '../../harness';

test.describe('toolbar responsive collapse', () => {
  test('desktop width shows every control on one row with no overflow menu', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    await expect(deckImportOpenButton(page)).toBeVisible();
    await expect(commandPaletteButton(page)).toBeVisible();
    await expect(helpButton(page)).toBeVisible();
    await expect(discordButton(page)).toBeVisible();
    await expect(kofiButton(page)).toBeVisible();
    await expect(connectionStatus(page)).toBeVisible();
    await expect(newGameButton(page)).toBeVisible();
    await expect(roomLinkButton(page)).toBeVisible();
    await expect(toolbarMoreButton(page)).not.toBeVisible();
  });

  test('phone width hides the ⌘K launcher and collapses Help/Discord/Ko-fi into the overflow menu', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);

    await expect(deckImportOpenButton(page)).toBeVisible();
    await expect(commandPaletteButton(page)).not.toBeVisible();
    await expect(helpButton(page)).not.toBeVisible();
    await expect(discordButton(page)).not.toBeVisible();
    await expect(kofiButton(page)).not.toBeVisible();
    await expect(connectionStatus(page)).toBeVisible();
    await expect(newGameButton(page)).toBeVisible();
    await expect(roomLinkButton(page)).toBeVisible();

    const moreButton = toolbarMoreButton(page);
    await expect(moreButton).toBeVisible();
    await moreButton.click();
    await expect(page.getByRole('menuitem', { name: 'Help' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Discord' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Support me on Ko-fi' })).toBeVisible();
  });

  test('phone width keeps the right-aligned cluster flush against the right edge', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);

    // The "⋯ More" trigger is the last flex child, so on phone it's the
    // rightmost visible element — its right edge should sit close to the
    // toolbar's own right edge (within the toolbar's horizontal padding),
    // confirming the `margin-left: auto` right-alignment survived the
    // collapse.
    const moreBox = await toolbarMoreButton(page).boundingBox();
    const toolbarBox = await toolbar(page).boundingBox();
    expect(moreBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();

    const rightGap = (toolbarBox!.x + toolbarBox!.width) - (moreBox!.x + moreBox!.width);
    expect(rightGap).toBeLessThan(40);
  });
});
