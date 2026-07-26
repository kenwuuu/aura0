/**
 * The round trip: a game saved to a file comes back.
 *
 * This is the spec that proves the feature exists at all. It deliberately goes
 * through the real download and the real file picker — a snapshot the app
 * cannot re-read is broken however correct its in-memory shape was — and it
 * restores into a *different* room, which is the only way to tell a real
 * restore apart from the original doc still being on disk.
 */
import { test, expect } from '../../fixtures';
import {
  exportSessionToFile,
  importSessionFile,
  playCreature,
  moveBetweenZones,
  expectPileCount,
  expectHandCount,
  boardCards,
  healthInput,
  newGameButton,
} from '../../harness';

test('a saved game comes back with its board, zones, and life intact', async ({ page }) => {
  // Put the game into a state no fresh room could be mistaken for.
  const card = await playCreature(page);
  await moveBetweenZones(page, card, 'discard');
  const played = await playCreature(page);
  const playedId = await played.getAttribute('data-card-id');
  await healthInput(page).fill('27');
  await healthInput(page).blur();

  await expectHandCount(page, 6);
  await expectPileCount(page, 'discard', 1);

  const savedGame = await exportSessionToFile(page);

  // A brand new room: nothing of the old game is on screen or in this doc.
  await newGameButton(page).click();
  await page.getByRole('dialog', { name: 'Start a New Game?' })
    .getByRole('button', { name: 'New Game' }).click();
  await expect(healthInput(page)).toHaveValue('40', { timeout: 15000 });
  const freshRoom = page.url();

  await importSessionFile(page, savedGame);

  // Restored into a different room than either the original or the fresh one.
  expect(page.url()).not.toBe(freshRoom);

  await expect(healthInput(page)).toHaveValue('27', { timeout: 20000 });
  await expectHandCount(page, 6);
  await expectPileCount(page, 'discard', 1);
  await expect(boardCards(page)).toHaveCount(1);
  await expect(boardCards(page).first()).toHaveAttribute('data-card-id', playedId!);
});
