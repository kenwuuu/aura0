import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import type { Card } from '@/features/player/types';
import { DEFAULT_CARD_BACK } from '@/constants';
import { CardPreview } from './CardPreview';
import { useCardPreviewStore } from './cardPreviewStore';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    cardNumber: 7,
    name: 'Lightning Bolt',
    images: {
      front: { normal: 'https://img/front-normal.png' },
      back: { normal: 'https://img/back-normal.png' },
    },
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  };
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

describe('CardPreview', () => {
  beforeEach(() => {
    // Store reset is centralized in src/test/setup.ts; only window geometry
    // needs seeding per-test here.
    setWindowWidth(1024);
  });

  describe('popup visibility', () => {
    it('renders no popup when the preview is hidden', () => {
      render(<CardPreview />);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders the popup once a card is shown', () => {
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true });
      render(<CardPreview />);
      expect(screen.getByAltText('Lightning Bolt')).toBeInTheDocument();
    });

    it('renders no popup when the front card has no normal image', () => {
      useCardPreviewStore.setState({
        card: makeCard({ images: { front: {} } }),
        isVisible: true,
      });
      render(<CardPreview />);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('image selection', () => {
    it('shows the front normal image with the card name as alt', () => {
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true });
      render(<CardPreview />);
      const img = screen.getByAltText('Lightning Bolt') as HTMLImageElement;
      expect(img.src).toContain('front-normal.png');
    });

    it('falls back to "Card #n" alt when the card has no name', () => {
      useCardPreviewStore.setState({
        card: makeCard({ name: undefined }),
        isVisible: true,
      });
      render(<CardPreview />);
      expect(screen.getByAltText('Card #7')).toBeInTheDocument();
    });

    it('shows the back image labeled "Card Back" when the card is flipped', () => {
      useCardPreviewStore.setState({
        card: makeCard({ isFlipped: true }),
        isVisible: true,
      });
      render(<CardPreview />);
      const img = screen.getByAltText('Card Back') as HTMLImageElement;
      expect(img.src).toContain('back-normal.png');
    });

    it('falls back to the default card back when a flipped card has no back image', () => {
      useCardPreviewStore.setState({
        card: makeCard({ isFlipped: true, images: { front: { normal: 'f.png' } } }),
        isVisible: true,
      });
      render(<CardPreview />);
      const img = screen.getByAltText('Card Back') as HTMLImageElement;
      expect(img.src).toContain(DEFAULT_CARD_BACK);
    });
  });

  describe('auto-dismiss on card movement', () => {
    it('hides the preview once the card is no longer present in its watched zone', async () => {
      const yDoc = new Y.Doc();
      const yHand = yDoc.getMap<Card[]>('player');
      const card = makeCard();
      yHand.set('hand', [card]);
      useCardPreviewStore.getState().show(card, {
        yMap: yHand,
        isPresent: () => (yHand.get('hand') ?? []).some((c) => c.id === card.id),
      });

      render(<CardPreview />);
      expect(screen.getByAltText('Lightning Bolt')).toBeInTheDocument();

      // Card moves out of hand (drag, hotkey, or pile-viewer action) — no
      // explicit hide() call, just the underlying Yjs mutation.
      act(() => {
        yHand.set('hand', []);
      });

      await waitFor(() => {
        expect(useCardPreviewStore.getState().isVisible).toBe(false);
      });
    });

    it('keeps the preview visible while the card remains in its watched zone', () => {
      const yDoc = new Y.Doc();
      const yHand = yDoc.getMap<Card[]>('player');
      const card = makeCard();
      const otherCard = makeCard({ id: 'card-2' });
      yHand.set('hand', [card]);
      useCardPreviewStore.getState().show(card, {
        yMap: yHand,
        isPresent: () => (yHand.get('hand') ?? []).some((c) => c.id === card.id),
      });

      render(<CardPreview />);

      // An unrelated mutation to the same map shouldn't dismiss the preview.
      yHand.set('hand', [card, otherCard]);

      expect(useCardPreviewStore.getState().isVisible).toBe(true);
      expect(screen.getByAltText('Lightning Bolt')).toBeInTheDocument();
    });
  });

  // Left/right placement math (shouldShowOnLeft) is pure logic with its own
  // dedicated coverage in cardPreviewLogic.test.ts. This component's only job
  // re: mouseX/mouseY is not to break rendering when they vary.
  describe('placement wiring', () => {
    it('still renders the card regardless of cursor position', () => {
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true, mouseX: 1000, mouseY: 100 });
      render(<CardPreview />);
      expect(screen.getByAltText('Lightning Bolt')).toBeInTheDocument();
    });
  });
});
