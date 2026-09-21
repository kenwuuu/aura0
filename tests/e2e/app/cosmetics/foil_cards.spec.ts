import { Page, expect } from '@playwright/test';
import { test } from '../../fixtures';
import {
  boardCardFoil,
  dragBoardCardToPile,
  foilOverlays,
  handCard,
  handCards,
  importDeck,
  openPileViewer,
  pileViewerCards,
  playHandCardToBoard,
  waitForPileViewerReady,
} from '../../harness';

/**
 * Foil as a player meets it: a deck list marked `*F*`, imported, rendered.
 *
 * Unit tests already cover the parser, the entitlement store and the sweep.
 * What only a real browser proves is the rendering — three surfaces, a CSS
 * module with blend modes, and a positioning context the hand did not
 * previously have. happy-dom computes none of that.
 */

/** Two foil cards and one plain, so "everything shimmers" cannot pass by accident. */
const DECKLIST = [
  '1 Sol Ring (C21) 263 *F*',
  '1 Arcane Signet (ELD) 331 *F*',
  '1 Command Tower (ELD) 333',
].join('\n');

/** Twelve foils, so an 8-card opening hand still leaves some in the deck. */
const ALL_FOIL_DECKLIST = [
  'Sol Ring', 'Arcane Signet', 'Command Tower', 'Lightning Bolt',
  'Counterspell', 'Dark Ritual', 'Giant Growth', 'Healing Salve',
  'Llanowar Elves', 'Birds of Paradise', 'Swords to Plowshares', 'Brainstorm',
]
  .map((name) => `1 ${name} *F*`)
  .join('\n');

/**
 * A Magic card's proportions — `CARD_WIDTH / CARD_HEIGHT` from `src/constants.ts`.
 *
 * Written out rather than imported because the e2e suite deliberately does not
 * reach into app source; the value is stable enough that pinning it here is the
 * honest trade. The bug this guards against produced roughly 0.94, so the
 * tolerance below has an order of magnitude of room.
 */
const CARD_ASPECT_RATIO = 63 / 88;

/** The ids of the hand cards currently drawn with a foil overlay. */
async function foilHandCardIds(page: Page): Promise<string[]> {
  return handCards(page).evaluateAll((nodes) =>
    nodes
      .filter((node) => node.querySelector('[data-testid="foil-overlay"]') !== null)
      .map((node) => node.getAttribute('data-card-id') ?? ''),
  );
}

test.describe('with the cosmetic unlocked', () => {
  test.use({ foilEntitlement: true });

  test.beforeEach(async ({ page }) => {
    await importDeck(page, 'Foil deck', DECKLIST);
    await expect(handCards(page)).toHaveCount(3);
  });

  test('shimmers exactly the cards the list marked foil', async ({ page }) => {
    // The hand is where a player sees the purchase first, right after importing.
    // Two of three, never all three — the assertion that would catch a guard
    // which foils everything it is handed.
    await expect(foilOverlays(page)).toHaveCount(2);
  });

  test('the shimmer follows a card onto the battlefield', async ({ page }) => {
    const foilIds = await foilHandCardIds(page);

    // Play until a foil card lands, so the assertion never depends on which
    // card the hand happened to offer first.
    for (let i = 0; i < 3; i++) {
      const node = await playHandCardToBoard(page);
      const id = await node.getAttribute('data-card-id');
      if (id && foilIds.includes(id)) {
        await expect(boardCardFoil(page, id)).toBeVisible();
        return;
      }
    }
    throw new Error('No foil card reached the battlefield.');
  });

  test('the shimmer shows inside the pile viewer', async ({ page }) => {
    // Deliberately the discard and not the deck: a deck pile is shown face down,
    // and a concealed card is *supposed* to render plain — asserting foil there
    // would be asserting a leak. So a foil card is put somewhere face up first.
    const foilIds = await foilHandCardIds(page);

    for (let i = 0; i < 3; i++) {
      const node = await playHandCardToBoard(page);
      const id = await node.getAttribute('data-card-id');
      if (id && foilIds.includes(id)) {
        await dragBoardCardToPile(page, node, 'discard');
        await openPileViewer(page, 'discard');
        await waitForPileViewerReady(page);

        const overlay = pileViewerCards(page).getByTestId('foil-overlay');
        await expect(overlay).toHaveCount(1);

        // Shape, not just presence. The overlay fills its positioning parent,
        // and that parent used to be the grid cell rather than the card: a cell
        // is a ~180px+ column by a fixed 250px, so the shimmer painted a wide
        // rectangle with the art floating inside it, square-ish and visibly not
        // hugging the card's edges. `toHaveCount` cannot see that — it was green
        // the whole time the bug was on screen — so this pins the one number
        // that tells the two apart.
        const box = await overlay.boundingBox();
        expect(box, 'the foil overlay should have a layout box').not.toBeNull();
        expect(box!.width / box!.height).toBeCloseTo(CARD_ASPECT_RATIO, 2);
        return;
      }
    }
    throw new Error('No foil card reached the battlefield.');
  });

  test('a face-down pile does not reveal which cards are foil', async ({ page }) => {
    // Its own deck, and every card in it foil: the three-card list above empties
    // straight into the opening hand, and an empty pile would pass this by
    // having nothing to draw at all. With twelve all-foil cards the deck still
    // holds several, so a single overlay here is a real leak.
    await importDeck(page, 'All foil', ALL_FOIL_DECKLIST);

    // The deck is shown face down. Drawing the shimmer there would announce that
    // a card the viewer cannot identify is a foil printing.
    await openPileViewer(page, 'deck');
    await waitForPileViewerReady(page);

    await expect(pileViewerCards(page)).not.toHaveCount(0);
    await expect(pileViewerCards(page).getByTestId('foil-overlay')).toHaveCount(0);
  });

  test('the card-number badge is unmoved by the foil wrapper', async ({ page }) => {
    // The hand had no positioning context before foil, and putting one on
    // `.hand-card` would have moved `.card-number-badge` — absolutely positioned
    // with a `right` and no `top`. The wrapper exists to avoid that, so the two
    // must stay separate branches: art inside the wrapper, badge outside it.
    const card = handCard(page).first();

    await expect(card.locator('.hand-card-art')).toHaveCount(1);
    await expect(card.locator('.hand-card-art .card-number-badge')).toHaveCount(0);
  });
});

test.describe('without the cosmetic', () => {
  test('a foil-tagged deck renders plain', async ({ page }) => {
    // The foil flags still survive the import — that is what makes a later
    // purchase apply retroactively — but nothing shimmers.
    await importDeck(page, 'Unpaid foils', DECKLIST);
    await expect(handCards(page)).toHaveCount(3);

    await expect(foilOverlays(page)).toHaveCount(0);
  });
});
