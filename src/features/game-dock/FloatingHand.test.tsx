import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatingHand } from './FloatingHand';
import { renderWithGame } from '@/test/harness';
import { makeCards } from '@/test/factories';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';

describe('FloatingHand', () => {
  it('renders nothing until the game instance is seeded', () => {
    render(<FloatingHand />);
    expect(screen.queryByTestId('hand-cards-container')).not.toBeInTheDocument();
  });

  it('renders every seeded hand card by name', () => {
    const hand = makeCards(3, (i) => ({ name: `Card ${i}` }));
    renderWithGame(<FloatingHand />, { hand });

    hand.forEach((card) => {
      expect(screen.getByAltText(card.name!)).toBeInTheDocument();
    });
  });

  it('reflects handZoom into the --card-zoom style variable driving card size', () => {
    useSettingsStore.setState({ handZoom: 2 });
    renderWithGame(<FloatingHand />, { hand: makeCards(1) });

    const container = screen.getByTestId('hand-cards-container');
    expect(container.style.getPropertyValue('--card-zoom')).toBe('2');
  });

  it('hovering a hand card sets the hover target and shows the card preview', async () => {
    const user = userEvent.setup();
    const hand = makeCards(1, { name: 'Lightning Bolt' });
    renderWithGame(<FloatingHand />, { hand });

    await user.hover(screen.getByAltText('Lightning Bolt'));

    expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'hand', id: hand[0].id });
    expect(useCardPreviewStore.getState().isVisible).toBe(true);
    expect(useCardPreviewStore.getState().card?.id).toBe(hand[0].id);

    await user.unhover(screen.getByAltText('Lightning Bolt'));

    expect(useHotkeyStore.getState().hoverTarget).toBeNull();
    expect(useCardPreviewStore.getState().isVisible).toBe(false);
  });

  it('re-derives hover onto the card that reflows under a stationary cursor after a hotkey move', async () => {
    const user = userEvent.setup();
    const hand = makeCards(2, (i) => ({ name: `Card ${i}` }));
    const { player } = renderWithGame(<FloatingHand />, { hand });

    await user.hover(screen.getByAltText('Card 0'));
    expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'hand', id: hand[0].id });

    // happy-dom has no layout engine, so stub elementFromPoint to report what a real
    // browser would find under the cursor once card 0 is removed and card 1 slides
    // into its screen slot — no mouseenter fires for that, since the pointer didn't move.
    document.elementFromPoint = vi.fn().mockReturnValue(screen.getByAltText('Card 1'));

    act(() => {
      player.movePileCard(hand[0], 'hand', 'discard');
    });

    await waitFor(() => {
      expect(useHotkeyStore.getState().hoverTarget).toEqual({ kind: 'hand', id: hand[1].id });
    });
  });

  it('falls back to demoHandCards only when the real hand is empty', () => {
    const demoHandCards = makeCards(2, (i) => ({ name: `Demo ${i}` }));
    useSettingsStore.setState({ demoHandCards });
    renderWithGame(<FloatingHand />, { hand: [] });

    demoHandCards.forEach((card) => {
      expect(screen.getByAltText(card.name!)).toBeInTheDocument();
    });
  });

  it('ignores demoHandCards once the real hand has cards', () => {
    const demoHandCards = makeCards(2, (i) => ({ name: `Demo ${i}` }));
    useSettingsStore.setState({ demoHandCards });
    const hand = makeCards(1, { name: 'Real Card' });
    renderWithGame(<FloatingHand />, { hand });

    expect(screen.getByAltText('Real Card')).toBeInTheDocument();
    expect(screen.queryByAltText('Demo 0')).not.toBeInTheDocument();
  });
});
