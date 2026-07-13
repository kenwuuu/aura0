import { test, expect } from '../fixtures';
import {
  duplicateTabNotice,
  handCards,
  openDuplicateTab,
  playHereButton,
} from '../harness';

/**
 * Two tabs of one browser share a player id but not a Y.Doc, which made them two
 * CRDT replicas of the same player — each seeing the other's legitimate plays as
 * a remote hand shrink (the `hand_clobbered` alarm), and able to overwrite each
 * other's hand for real. Only one tab may hold a room.
 */
test.describe('duplicate tab', () => {
  test('a second tab of the same browser is refused the room', async ({ page }) => {
    const duplicate = await openDuplicateTab(page);

    try {
      await expect(duplicateTabNotice(duplicate)).toBeVisible({ timeout: 15000 });
      // It must not merely *look* blocked: the duplicate never boots a game, so
      // there is no second Y.Doc to author this player's hand behind our back.
      await expect(handCards(duplicate)).toHaveCount(0);
      // The tab that holds the room is untouched.
      await expect(handCards(page)).toHaveCount(8);
    } finally {
      await duplicate.close();
    }
  });

  test('"play here instead" hands the room over, and the first tab stands down', async ({ page }) => {
    const duplicate = await openDuplicateTab(page);

    try {
      await expect(duplicateTabNotice(duplicate)).toBeVisible({ timeout: 15000 });

      await playHereButton(duplicate).click();

      // The claiming tab gets a real game...
      await expect(handCards(duplicate)).toHaveCount(8, { timeout: 20000 });
      // ...and the tab that had it yields, rather than the two trading the room
      // back and forth or both ending up live.
      await expect(duplicateTabNotice(page)).toBeVisible({ timeout: 20000 });
      await expect(handCards(page)).toHaveCount(0);
    } finally {
      await duplicate.close();
    }
  });
});
