import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
