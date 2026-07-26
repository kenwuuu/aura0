/**
 * The second player's half of a restore: they get a link, not a file.
 *
 * This is the case the URL's `resume=1` flag exists for. `whenSynced()` resolves
 * on IndexedDB alone, so when this page boots its doc is empty and cannot be
 * asked whether it is a restored game — only the link knows in time. If that
 * flag ever stops being carried, this spec fails by seating the second player as
 * a stranger with a fresh 40-life deck instead of offering them Alice's seat.
 */
import { test, expect } from '../../fixtures';
import {
  exportSessionToFile,
  importSessionFile,
  seatSelectionScreen,
  seatOptions,
  playCreature,
  handCards,
  healthInput,
  blockAnalytics,
  markReturningPlayer,
  waitForSync,
  boardCards,
} from '../../harness';

test('a player sent the link picks their seat and gets their own game back', async ({ page }) => {
  // Two seats in the saved game: this player, and one who joined from elsewhere.
  const browser = page.context().browser()!;
  const guestContext = await browser.newContext();
  await markReturningPlayer(guestContext);
  const guest = await guestContext.newPage();
  await blockAnalytics(guest);
  await guest.goto(page.url(), { waitUntil: 'networkidle' });
  await expect(handCards(guest)).toHaveCount(8, { timeout: 15000 });
  await waitForSync(page, 2);

  // Make the two seats tell apart: only the guest has a card on the board.
  await playCreature(guest);
  await guest.evaluate(() => window.localStorage.setItem('aura:playerName', 'Guest'));
  await expect(boardCards(page)).toHaveCount(1, { timeout: 15000 });

  const savedGame = await exportSessionToFile(page);
  await guestContext.close();

  // Player one restores it and takes seat 0.
  await importSessionFile(page, savedGame, 0);
  const resumedUrl = page.url();
  expect(new URL(resumedUrl).searchParams.get('resume')).toBe('1');

  // Player two opens the link from a device that has never seen this game.
  const secondContext = await browser.newContext();
  await markReturningPlayer(secondContext);
  const second = await secondContext.newPage();
  await blockAnalytics(second);

  try {
    await second.goto(resumedUrl, { waitUntil: 'networkidle' });

    // Offered a seat rather than dropped into the game as a new player.
    await expect(seatSelectionScreen(second)).toBeVisible({ timeout: 20000 });
    await expect(seatOptions(second)).toHaveCount(2, { timeout: 20000 });

    // The seat player one already took is spoken for.
    await expect(seatOptions(second).filter({ hasText: 'Taken' })).toHaveCount(1);

    const free = seatOptions(second).filter({ hasNotText: 'Taken' });
    await free.click();

    // They land in the restored game, not a fresh one: the board card that only
    // ever existed in the saved game is theirs again.
    await expect(healthInput(second)).toBeVisible({ timeout: 30000 });
    await expect(boardCards(second)).toHaveCount(1, { timeout: 20000 });
    await waitForSync(page, 2);
  } finally {
    await secondContext.close();
  }
});
