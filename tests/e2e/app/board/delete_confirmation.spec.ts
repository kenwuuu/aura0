import { expect, test } from '../../fixtures';
import { boardCardIds, openCardMenu, playCreature } from '../../harness';

/**
 * The delete confirmation as a player actually meets it. The rest of the suite
 * runs with it off (see the `deleteConfirmation` fixture option), so this is the
 * only place the shipped default is exercised end-to-end.
 *
 * Component tests already cover the checkbox reporting and the store gate; what
 * only a real browser proves is the Radix dismiss-layer behavior — the dialog
 * stacking over the context menu, and cancel actually leaving the card alone.
 * (Per the project's Radix note, dismiss-layer bugs pass in happy-dom either
 * way, so they have to be guarded here.)
 */
test.use({ deleteConfirmation: true });

const confirmDialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: 'Delete card?' });

test('asks before deleting, and cancelling keeps the card', async ({ page }) => {
  const card = await playCreature(page);
  const idsBefore = await boardCardIds(page);

  await openCardMenu(page, card);
  await page.getByText('DeleteBack').click();

  await expect(confirmDialog(page)).toBeVisible();
  // The card is still there while the question is open.
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(confirmDialog(page)).toBeHidden();
  await expect(card).toBeVisible();
  expect(await boardCardIds(page)).toEqual(idsBefore);
});

test('deletes the card once confirmed', async ({ page }) => {
  const card = await playCreature(page);

  await openCardMenu(page, card);
  await page.getByText('DeleteBack').click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(confirmDialog(page)).toBeHidden();
  await expect(card).toBeHidden();
});

test('"Don\'t ask again" deletes now and skips the prompt next time', async ({ page }) => {
  const first = await playCreature(page);

  await openCardMenu(page, first);
  await page.getByText('DeleteBack').click();
  await page.getByRole('checkbox', { name: "Don't ask again" }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(first).toBeHidden();

  // Second delete goes straight through — no dialog to answer.
  const second = await playCreature(page);
  await openCardMenu(page, second);
  await page.getByText('DeleteBack').click();

  await expect(second).toBeHidden();
  await expect(confirmDialog(page)).toBeHidden();
});
