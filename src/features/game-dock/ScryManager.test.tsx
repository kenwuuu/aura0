import { describe, it, expect } from 'vitest';
import { screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScryManager } from './ScryManager';
import { useScryStore } from './scryStore';
import { GameContextMenu } from '@/features/hotkeys/GameContextMenu';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { useNumberPromptStore } from '@/features/game-actions/numberPromptStore';
import { renderWithGame } from '@/test/harness';
import { makeCards } from '@/test/factories';

/**
 * Regression tests for the scry viewer's right-click move path.
 *
 * These cover a bug pair that shipped together and shared one root cause: the
 * click path used to close the viewer on a move, and `ScryManager.handleClose`
 * returns *every remaining scried card* to the deck. So clicking "To deck top"
 * on one card moved that card (+1) **and** dumped the rest of the scry pile
 * back on the deck — the deck grew by the whole scry, not by one. The keyboard
 * hotkey never closed the viewer and was always correct; the two paths have
 * since been unified behind `dispatchPileMove`.
 *
 * The load-bearing assertion is the exact deck count. "Viewer stays open" alone
 * would not have caught the over-credit, and an approximate count would not
 * have caught it either.
 */

const DECK_SIZE = 10;
const SCRY_COUNT = 3;

/**
 * The pile viewer is a *modal* Radix Dialog, so Radix puts `pointer-events: none`
 * on `<body>`, and the context menu portals outside the dialog (it lives in App's
 * own React root — see PileViewerReact's `onPointerDownOutside` guard). A real
 * browser still delivers the click because Radix re-enables pointer events on the
 * topmost dismissable layer; happy-dom does not model that, so user-event's
 * inherited-pointer-events guard would reject every menu click. Turn the guard off
 * rather than assert on Radix's internals.
 */
const clickThroughModal = () => userEvent.setup({ pointerEventsCheck: 0 });

/** Drive the real request → number-prompt → confirm path that opens the viewer. */
function openScryViewer(count: number) {
  act(() => {
    useScryStore.getState().request();
  });

  const request = useNumberPromptStore.getState().request;
  expect(request, 'scry should have opened the number prompt').not.toBeNull();

  act(() => {
    request!.onConfirm(count);
  });
}

/** Right-click a scry card — the same target the card grid opens the menu with. */
function openContextMenuOn(cardId: string) {
  act(() => {
    useContextMenuStore.getState().openMenu({
      target: { kind: 'pileViewerCard', id: cardId, context: HotkeyContext.Scry },
      x: 10,
      y: 10,
    });
  });
}

describe('ScryManager — right-click move out of the scry viewer', () => {
  it('"To deck top" moves exactly one card to the deck and leaves the rest scried', async () => {
    const user = clickThroughModal();
    const { player } = renderWithGame(
      <>
        <ScryManager />
        <GameContextMenu />
      </>,
      { deck: makeCards(DECK_SIZE) },
    );

    openScryViewer(SCRY_COUNT);

    // Scrying moved SCRY_COUNT cards off the deck and into the scry pile.
    const deckAfterScry = player.getDeck().getCardCount();
    expect(deckAfterScry).toBe(DECK_SIZE - SCRY_COUNT);
    expect(player.getScryPile().getCards()).toHaveLength(SCRY_COUNT);

    const [firstScried] = player.getScryPile().getCards();
    openContextMenuOn(firstScried.id);

    // The row's accessible name is "To deck top" + its shortcut hint.
    await user.click(await screen.findByRole('menuitem', { name: /^To deck top\b/, hidden: true }));

    // One card moved — not the whole scry pile.
    expect(player.getDeck().getCardCount()).toBe(deckAfterScry + 1);
    expect(player.getScryPile().getCards()).toHaveLength(SCRY_COUNT - 1);
  });

  it('"To deck top" leaves the viewer open so a second card can be moved', async () => {
    const user = clickThroughModal();
    const { player } = renderWithGame(
      <>
        <ScryManager />
        <GameContextMenu />
      </>,
      { deck: makeCards(DECK_SIZE) },
    );

    openScryViewer(SCRY_COUNT);
    const deckAfterScry = player.getDeck().getCardCount();

    openContextMenuOn(player.getScryPile().getCards()[0].id);
    await user.click(await screen.findByRole('menuitem', { name: /^To deck top\b/, hidden: true }));

    // The viewer must survive the move — the whole point of the scry UI is
    // triaging several cards in a row.
    const viewer = await screen.findByTestId('pile-viewer');
    expect(within(viewer).getByText('Scry and Surveil')).toBeInTheDocument();

    // And a second move still lands, one card at a time.
    openContextMenuOn(player.getScryPile().getCards()[0].id);
    await user.click(await screen.findByRole('menuitem', { name: /^To deck bottom\b/, hidden: true }));

    expect(player.getDeck().getCardCount()).toBe(deckAfterScry + 2);
    expect(player.getScryPile().getCards()).toHaveLength(SCRY_COUNT - 2);
  });

  it('closing the viewer returns the cards still scried — and only those', async () => {
    const user = clickThroughModal();
    const { player } = renderWithGame(
      <>
        <ScryManager />
        <GameContextMenu />
      </>,
      { deck: makeCards(DECK_SIZE) },
    );

    openScryViewer(SCRY_COUNT);
    const deckAfterScry = player.getDeck().getCardCount();

    openContextMenuOn(player.getScryPile().getCards()[0].id);
    await user.click(await screen.findByRole('menuitem', { name: /^To deck top\b/, hidden: true }));

    await user.keyboard('{Escape}');

    // 1 moved by hand + the 2 still in the pile = the deck is whole again, and
    // the card that was already moved is not double-counted.
    expect(player.getDeck().getCardCount()).toBe(deckAfterScry + SCRY_COUNT);
    expect(player.getScryPile().getCards()).toHaveLength(0);
  });
});
