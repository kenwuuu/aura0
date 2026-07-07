import { test } from '../../fixtures';
import { expectHandCount, expectPileCount, handCard } from '../../harness';

/**
 * Removing the hovered hand card via a hotkey unmounts its DOM node without a
 * real mouseleave, and the sibling that reflows into that screen slot never
 * gets a mouseenter either (the pointer itself never moved). Regression test
 * for the HandCardsContainer fix that re-derives hover from the last known
 * pointer position instead of requiring the user to move the mouse off the
 * card and back on before the next hotkey registers.
 */
test('pressing a hotkey twice on a hand card without moving the mouse moves both', async ({ page }) => {
  await handCard(page).first().hover();
  await page.keyboard.press('d');
  await page.keyboard.press('d');

  await expectPileCount(page, 'discard', 2);
  await expectHandCount(page, 6);
});
