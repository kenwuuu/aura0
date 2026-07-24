import { describe, it, expect, vi } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PileViewerReact, type PileViewerCallbacks } from './PileViewerReact';
import { usePileViewerHotkeyStore } from '../pileViewerHotkeyStore';
import { renderWithGame } from '@/test/harness';
import { makeCards } from '@/test/factories';

/**
 * The pile viewer is a modal Radix Dialog (body gets `pointer-events: none`,
 * which happy-dom doesn't re-enable on the top layer). Turn off user-event's
 * inherited-pointer-events guard so taps on cards inside the dialog land — same
 * rationale as ScryManager.test.tsx.
 */
const tapThroughModal = () => userEvent.setup({ pointerEventsCheck: 0 });

function renderDeckViewer(callbacks: PileViewerCallbacks, cardCount = 4) {
  const cards = makeCards(cardCount);
  const result = renderWithGame(
    <PileViewerReact isOpen onClose={() => {}} cards={cards} pileType="deck" callbacks={callbacks} />,
  );
  return { cards, ...result };
}

const idOf = (el: Element) => el.getAttribute('data-card-id');

describe('PileViewerReact — tap-to-select + destination bar', () => {
  it('selecting two cards then a destination moves both and clears the selection', async () => {
    const user = tapThroughModal();
    const onMoveToHand = vi.fn();
    renderDeckViewer({ onMoveToHand, onMoveToDeckTop: () => {}, onMoveToDeckBottom: () => {} });

    const cardEls = await screen.findAllByTestId('pile-viewer-card');
    await user.click(cardEls[0]);
    await user.click(cardEls[1]);

    // The destination bar rose and counts the selection.
    expect(screen.getByTestId('pile-destination-count')).toHaveTextContent('2 SELECTED');
    expect(cardEls[0]).toHaveAttribute('data-selected', 'true');

    await user.click(screen.getByTestId('pile-destination-moveToHand'));

    // Both selected cards moved (batch), and the bar cleared (zero chrome again).
    expect(onMoveToHand).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('pile-destination-bar')).not.toBeInTheDocument();
  });

  it('tapping a selected card again deselects it', async () => {
    const user = tapThroughModal();
    renderDeckViewer({ onMoveToHand: () => {} });

    const cardEls = await screen.findAllByTestId('pile-viewer-card');
    await user.click(cardEls[0]);
    expect(screen.getByTestId('pile-destination-count')).toHaveTextContent('1 SELECTED');

    await user.click(cardEls[0]);
    // Back to zero selection → bar is gone.
    expect(screen.queryByTestId('pile-destination-bar')).not.toBeInTheDocument();
  });
});

describe('PileViewerReact — play to board facedown', () => {
  it('routes the menu action to onPlayToBattlefield with the facedown flag', () => {
    const onPlayToBattlefield = vi.fn();
    const { cards } = renderDeckViewer({ onPlayToBattlefield, onMoveToHand: () => {} });

    // The right-click menu and the hotkey layer both arrive through this handler.
    act(() => {
      usePileViewerHotkeyStore.getState().actionHandler!('playFacedown', cards[0].id);
    });

    expect(onPlayToBattlefield).toHaveBeenCalledTimes(1);
    expect(onPlayToBattlefield.mock.calls[0][0]).toMatchObject({ id: cards[0].id });
    expect(onPlayToBattlefield.mock.calls[0][1]).toEqual({ facedown: true });
  });

  it('plays the whole selection face down when one exists', async () => {
    const user = tapThroughModal();
    const onPlayToBattlefield = vi.fn();
    renderDeckViewer({ onPlayToBattlefield, onMoveToHand: () => {} });

    const cardEls = await screen.findAllByTestId('pile-viewer-card');
    await user.click(cardEls[0]);
    await user.click(cardEls[1]);
    const selectedIds = [idOf(cardEls[0]), idOf(cardEls[1])].sort();

    act(() => {
      usePileViewerHotkeyStore.getState().actionHandler!('playFacedown', idOf(cardEls[2])!);
    });

    const playedIds = onPlayToBattlefield.mock.calls.map((c) => (c[0] as { id: string }).id).sort();
    expect(playedIds).toEqual(selectedIds);
    expect(onPlayToBattlefield.mock.calls.every((c) => c[1]?.facedown === true)).toBe(true);
  });

  it('publishes only the actions it was given callbacks for', () => {
    renderDeckViewer({ onPlayToBattlefield: () => {}, onMoveToHand: () => {} });

    const published = usePileViewerHotkeyStore.getState().availableActions;
    expect([...published].sort()).toEqual(['moveToHand', 'playFacedown']);
  });

  it('publishes no facedown play for a viewer that cannot play to the board', () => {
    // The scry viewer only reorders the top of the library — it has no play
    // callback, so the menu must not offer the row there.
    renderDeckViewer({ onMoveToDeckTop: () => {}, onMoveToDeckBottom: () => {} });

    expect(usePileViewerHotkeyStore.getState().availableActions.has('playFacedown')).toBe(false);
  });
});

describe('PileViewerReact — hotkey precedence (selection vs hover)', () => {
  it('with a selection, an H/D/S/T/Y press moves the whole batch, not the hovered card', async () => {
    const user = tapThroughModal();
    const onMoveToExile = vi.fn();
    const { cards } = renderDeckViewer({ onMoveToExile });

    const cardEls = await screen.findAllByTestId('pile-viewer-card');
    await user.click(cardEls[0]);
    await user.click(cardEls[1]);
    const selectedIds = [idOf(cardEls[0]), idOf(cardEls[1])].sort();

    // Simulate the global hotkey layer pressing S while hovering a *different* card.
    const hovered = cards.find((c) => !selectedIds.includes(c.id))!;
    act(() => {
      usePileViewerHotkeyStore.getState().actionHandler!('moveToExile', hovered.id);
    });

    expect(onMoveToExile).toHaveBeenCalledTimes(2);
    const movedIds = onMoveToExile.mock.calls.map((c) => (c[0] as { id: string }).id).sort();
    expect(movedIds).toEqual(selectedIds);
  });

  it('with no selection, an H/D/S/T/Y press acts only on the hovered card', async () => {
    const onMoveToExile = vi.fn();
    const { cards } = renderDeckViewer({ onMoveToExile });
    await screen.findAllByTestId('pile-viewer-card');

    act(() => {
      usePileViewerHotkeyStore.getState().actionHandler!('moveToExile', cards[0].id);
    });

    expect(onMoveToExile).toHaveBeenCalledTimes(1);
    expect((onMoveToExile.mock.calls[0][0] as { id: string }).id).toBe(cards[0].id);
  });
});
