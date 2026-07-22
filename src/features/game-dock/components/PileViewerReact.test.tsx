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
