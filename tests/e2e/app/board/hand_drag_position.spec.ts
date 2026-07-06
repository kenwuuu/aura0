import { expect, test } from '../../fixtures';
import { boardCard, drawCard, mouseDrag, visibleHandCard, whiteboard } from '../../harness';

/**
 * Regression test: playing a card from hand used to land further off-target
 * the more cards had been drawn beforehand. Root cause was reconstructing the
 * drop point from dnd-kit's DragEndEvent.delta, which is scroll-adjusted for
 * the hand strip's own horizontal auto-scroll — so the computed position
 * drifted by an amount tied to how far the hand had auto-scrolled (drawing
 * more cards scrolls it further). See dragDropCoordinates.ts for the full
 * explanation.
 *
 * Repeats the same drag (same screen start/end points) across several draws
 * and asserts the landed position never moves — the actual signature of the
 * bug, rather than asserting a specific absolute pixel target.
 */
test('playing a card from hand lands at the same spot regardless of how many cards were drawn first', async ({ page }) => {
  const boardBox = (await whiteboard(page).boundingBox())!;
  const target = { x: boardBox.x + boardBox.width / 2, y: boardBox.y + boardBox.height / 2 };

  let firstLanded: { x: number; y: number } | null = null;
  for (let i = 0; i < 4; i++) {
    await drawCard(page);
    const { x, y, cardId } = await visibleHandCard(page);
    await mouseDrag(page, { x, y }, target);

    const box = await boardCard(page, cardId).boundingBox();
    expect(box).not.toBeNull();
    const landed = { x: box!.x, y: box!.y };
    if (firstLanded === null) {
      firstLanded = landed;
    } else {
      expect(Math.abs(landed.x - firstLanded.x)).toBeLessThan(1);
      expect(Math.abs(landed.y - firstLanded.y)).toBeLessThan(1);
    }
  }
});
