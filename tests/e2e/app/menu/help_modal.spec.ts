/**
 * E2e coverage for the Help modal's Guide (src/app/HelpModal.tsx).
 *
 * The unit tests already pin the rail, the tab and the deep-link wiring. What
 * only a real browser can check is that the pane genuinely *scrolls* — happy-dom
 * has `scrollIntoView`, but it's a no-op there, so a rail that highlights the
 * right section while showing the wrong prose would pass unit tests happily.
 */
import { test, expect } from '../../fixtures';
import {
  commandPalette,
  commandPaletteInput,
  helpButton,
  helpModal,
  helpRailSection,
  helpSection,
  helpTab,
} from '../../harness';

test('the guide rail scrolls the pane to the section you pick', async ({ page }) => {
  await helpButton(page).click();
  await expect(helpModal(page)).toBeVisible();

  // Opens at the top of the guide.
  await expect(helpSection(page, 'inviting-friends')).toBeInViewport();

  // A section far enough down the manifest that it starts off screen.
  const deckActions = helpSection(page, 'deck-actions');
  await expect(deckActions).not.toBeInViewport();

  await helpRailSection(page, 'Deck actions').click();

  await expect(deckActions).toBeInViewport();
  await expect(helpRailSection(page, 'Deck actions')).toHaveAttribute('aria-current', 'true');
});

test('the guide documents the deck actions that have no keyboard shortcut', async ({ page }) => {
  // Scry, Surveil and Mill carry `key: ''`, so the Shortcuts tab can't list
  // them. Before this rewrite they were documented nowhere in the product.
  await helpButton(page).click();
  await helpRailSection(page, 'Deck actions').click();

  const section = helpSection(page, 'deck-actions');
  await expect(section.getByText('Scry', { exact: true })).toBeVisible();
  await expect(section.getByText('Surveil', { exact: true })).toBeVisible();
  await expect(section.getByText('Mill', { exact: true })).toBeVisible();
});

test('a `key:` reference renders the live binding, not literal text', async ({ page }) => {
  await helpButton(page).click();

  // "Tapping and untapping" writes `key:tap`; HOTKEYS binds tap to Space.
  const section = helpSection(page, 'tapping-and-untapping');
  await helpRailSection(page, 'Tapping and untapping').click();

  await expect(section.getByText('Space').first()).toBeVisible();
  await expect(section).not.toContainText('key:tap');
});

test('a palette shortcut row opens Help on the Shortcuts tab', async ({ page }) => {
  // These rows need a hovered target so the palette can't run them; they used
  // to do nothing at all on Enter, which is most of the palette's rows.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();

  await commandPaletteInput(page).fill('tap card');
  await page.getByRole('option', { name: /tap card/i }).click();

  await expect(commandPalette(page)).not.toBeVisible();
  await expect(helpModal(page)).toBeVisible();
  await expect(helpTab(page, 'Shortcuts')).toHaveAttribute('aria-selected', 'true');
});

test('reopening Help after a deep link lands back at the top', async ({ page }) => {
  // The target has to be cleared on close, or the toolbar button silently
  // reopens wherever the last deep link pointed.
  await page.keyboard.press('ControlOrMeta+k');
  await commandPaletteInput(page).fill('tap card');
  await page.getByRole('option', { name: /tap card/i }).click();
  await expect(helpTab(page, 'Shortcuts')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(helpModal(page)).not.toBeVisible();

  await helpButton(page).click();
  await expect(helpTab(page, 'Guide')).toHaveAttribute('aria-selected', 'true');
});
