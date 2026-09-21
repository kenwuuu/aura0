/**
 * E2e coverage for searching the Help guide from the ⌘K palette (#164, B1–B3).
 *
 * Ordering and selection can only be tested here. cmdk orders rows with real
 * DOM moves that happy-dom doesn't carry out, so in a unit test the first row in
 * source order stays `aria-selected` regardless of what the filter returns — an
 * assertion about it passes even with the filter deleted.
 * `paletteFilter.test.ts` pins the scores; this pins what the player sees.
 */
import { test, expect } from '../../fixtures';
import type { Page } from '@playwright/test';
import {
  commandPalette,
  commandPaletteInput,
  helpModal,
  helpSection,
  helpTab,
  selectedPaletteRow,
} from '../../harness';

async function search(page: Page, query: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();
  await commandPaletteInput(page).fill(query);
}

test('a term with no shortcut and no runnable command finds its section', async ({ page }) => {
  // Scry carries no key, so `getHotkeysGroupedByZone` drops it from the
  // shortcut reference, and it isn't runnable from the palette. Before this,
  // "scry" in ⌘K returned 13 rows, none of them about scrying.
  await search(page, 'scry');

  await expect(selectedPaletteRow(page)).toContainText('Deck actions');
});

test('a section matches on a curated keyword its title never mentions', async ({ page }) => {
  await search(page, 'poison');

  await expect(selectedPaletteRow(page)).toContainText('Life and player counters');
});

test('picking a section opens Help scrolled to it', async ({ page }) => {
  await search(page, 'surveil');
  await commandPalette(page).getByText('Deck actions').click();

  await expect(commandPalette(page)).not.toBeVisible();
  await expect(helpModal(page)).toBeVisible();
  await expect(helpTab(page, 'Guide')).toHaveAttribute('aria-selected', 'true');
  await expect(helpSection(page, 'deck-actions')).toBeInViewport();
});

test('a runnable action wins when the query names one', async ({ page }) => {
  // The guide documents mulligans too, so both match — the runnable row has to
  // stay selected or Enter opens a doc instead of taking a mulligan.
  await search(page, 'mulligan');

  await expect(selectedPaletteRow(page)).toContainText('Mulligan');
  await expect(selectedPaletteRow(page)).not.toContainText('›');
});

test('the relevance floor keeps unrelated rows out of the results', async ({ page }) => {
  // "scry" used to fuzzy-match "Import a deck" (0.005) and "Join our Discord"
  // (0.005) and rank them above the section that actually explains scrying.
  await search(page, 'scry');

  await expect(commandPalette(page).getByText('Import a deck')).toHaveCount(0);
  await expect(commandPalette(page).getByText('Join our Discord')).toHaveCount(0);
});

test('the palette always has a row selected as soon as you type', async ({ page }) => {
  // Regression guard: rendering the Help group only once a search existed lost
  // the race with cmdk's item registration, and the FIRST query after opening
  // matched rows but selected none — so Enter silently did nothing.
  await search(page, 'scry');

  await expect(selectedPaletteRow(page)).toHaveCount(1);
});
