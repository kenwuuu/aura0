/**
 * The way out of the wrong seat.
 *
 * Claiming a seat is the one action that can show you another player's hand, and
 * the picker cannot be perfect — two players can choose at the same instant, and
 * a game where both sides loaded the same deck genuinely does look alike. So the
 * claim has to be reversible, and this is the spec that says it is.
 */
import { test, expect } from '../../fixtures';
import {
  exportSessionToFile,
  importSessionFile,
  settingsButton,
  seatSelectionScreen,
  seatOptions,
  claimOfferedSeat,
  healthInput,
} from '../../harness';

test('a player who took the wrong seat can change it', async ({ page }) => {
  const savedGame = await exportSessionToFile(page);
  await importSessionFile(page, savedGame);

  // In an ordinary game there is no seat to change, so the control only exists
  // here — inside a restored one.
  await settingsButton(page).click();
  const changeSeat = page.getByTestId('change-seat');
  await expect(changeSeat).toBeVisible({ timeout: 10000 });

  await changeSeat.click();
  await page.getByRole('dialog', { name: 'Change seat?' })
    .getByRole('button', { name: 'Change seat' }).click();

  // Back to the picker rather than silently reseated.
  await expect(seatSelectionScreen(page)).toBeVisible({ timeout: 20000 });

  // And the seat can be taken again — releasing is local, so nothing about the
  // game itself was given up by backing out of it.
  await claimOfferedSeat(page, seatOptions(page).first());
  await expect(healthInput(page)).toBeVisible({ timeout: 30000 });
});
