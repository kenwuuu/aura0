import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { PileViewerReact } from './PileViewerReact';
import { CardPreview } from '@/features/card-preview/CardPreview';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { renderWithGame } from '@/test/harness';
import { makeCards } from '@/test/factories';
import { YDOC_PLAYER, YSTATE_EXILE_PILE } from '@/constants';

/**
 * Regression: the card preview must pop up when hovering a card in ANY pile
 * viewer, not just the local deck. It auto-dismisses once the hovered card
 * leaves the pile by watching a Yjs map for the card's presence; the bug was
 * that every viewer watched the *local* player's map, so an opponent viewer
 * (whose cards live in the opponent's map) found nothing and hid the preview
 * the instant it appeared.
 */
beforeEach(() => {
  useCardPreviewStore.getState().hide();
});

async function hoverFirstCardAndReadPreview() {
  const cardEls = await screen.findAllByTestId('pile-viewer-card');
  await act(async () => {
    fireEvent.mouseEnter(cardEls[0], { clientX: 100, clientY: 100 });
  });
  return useCardPreviewStore.getState().isVisible;
}

describe('PileViewerReact — card preview presence source', () => {
  it('shows the preview for a local pile (cards in the local player state)', async () => {
    const game = renderWithGame(
      <>
        <PileViewerReact isOpen onClose={() => {}} cards={[]} pileType="exile" callbacks={{ onMoveToHand: () => {} }} />
        <CardPreview />
      </>,
    );
    const cards = makeCards(3);
    // Re-render with the seeded cards actually present in the local exile pile.
    act(() => {
      cards.forEach((c) => game.player.placeCardInPile(c, 'exile'));
    });
    game.rerender(
      <>
        <PileViewerReact isOpen onClose={() => {}} cards={cards} pileType="exile" callbacks={{ onMoveToHand: () => {} }} />
        <CardPreview />
      </>,
    );

    expect(await hoverFirstCardAndReadPreview()).toBe(true);
  });

  it('shows the preview for an opponent pile via cardsOwnerState', async () => {
    const game = renderWithGame(<div />);
    const oppMap = game.yDoc.getMap(YDOC_PLAYER('opp-1'));
    const cards = makeCards(3);
    act(() => {
      oppMap.set(YSTATE_EXILE_PILE, cards);
    });

    game.rerender(
      <>
        <PileViewerReact
          isOpen
          onClose={() => {}}
          cards={cards}
          pileType="exile"
          callbacks={{}}
          cardsOwnerState={oppMap}
        />
        <CardPreview />
      </>,
    );

    // The LOCAL exile pile is empty; only the fix (watching the opponent's map)
    // keeps the preview from being dismissed on sight.
    expect(await hoverFirstCardAndReadPreview()).toBe(true);
  });
});
