/**
 * Regression guard for the trap that would silently gut this feature.
 *
 * `autoLoadDeckOnStart` treats any room not in `aura-visited-rooms` as new and
 * calls `player.reset()` + `loadNewDeck` on it. An imported game always lands in
 * a brand-new room id, so without `startImport` marking that room visited first,
 * the restore is written and then immediately overwritten by a fresh 8-card
 * opening hand — with no error anywhere.
 *
 * Verified to fail when the `markRoomVisited` call in `startImport` is removed.
 */
import { test, expect } from '../../fixtures';
import {
  exportSessionToFile,
  importSessionFile,
  drawCard,
  expectHandCount,
  expectPileCount,
} from '../../harness';

test('a restored game is not reset by the new-room deck auto-load', async ({ page }) => {
  // Move away from the default opening hand, so "reset happened" is visible.
  await drawCard(page);
  await drawCard(page);
  await expectHandCount(page, 10);
  await expectPileCount(page, 'deck', 90);

  const savedGame = await exportSessionToFile(page);
  await importSessionFile(page, savedGame);

  // The restored hand, not the 8 a fresh room would deal.
  await expectHandCount(page, 10);
  await expectPileCount(page, 'deck', 90);
});
