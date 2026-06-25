import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    localStorage.clear();
    useCardPreviewStore.setState({
      card: null,
      isVisible: false,
      mouseX: 0,
      mouseY: 0,
      zoom: 1,
    });
    setWindowWidth(1024);
  });

  describe('popup visibility', () => {
    it('renders no popup when the preview is hidden', () => {
      const { container } = render(<CardPreview />);
      expect(container.querySelector('.card-preview-popup')).toBeNull();
    });

    it('renders the popup once a card is shown', () => {
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true });
      const { container } = render(<CardPreview />);
      expect(container.querySelector('.card-preview-popup')).not.toBeNull();
    });

    it('renders no popup when the front card has no normal image', () => {
      useCardPreviewStore.setState({
        card: makeCard({ images: { front: {} } }),
        isVisible: true,
      });
      const { container } = render(<CardPreview />);
      expect(container.querySelector('.card-preview-popup')).toBeNull();
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

  describe('left/right placement', () => {
    it('anchors to the right by default', () => {
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true, mouseX: 100, mouseY: 100 });
      const { container } = render(<CardPreview />);
      const popup = container.querySelector('.card-preview-popup') as HTMLElement;
      expect(popup.style.right).toBe('20px');
      expect(popup.style.left).toBe('auto');
    });

    it('flips to the left when the cursor sits where the preview would cover it', () => {
      // width*1.1 = 550; innerWidth 1024 -> threshold 474. mouseX 1000 > 474, mouseY 100 < 767.8.
      useCardPreviewStore.setState({ card: makeCard(), isVisible: true, mouseX: 1000, mouseY: 100 });
      const { container } = render(<CardPreview />);
      const popup = container.querySelector('.card-preview-popup') as HTMLElement;
      expect(popup.style.left).toBe('20px');
      expect(popup.style.right).toBe('auto');
    });
  });

  describe('zoom controls', () => {
    it('always renders the zoom-control cluster, even when hidden', () => {
      render(<CardPreview />);
      expect(screen.getByTitle('Zoom In Card Preview')).toBeInTheDocument();
      expect(screen.getByTitle('Reset Card Preview Zoom')).toBeInTheDocument();
      expect(screen.getByTitle('Zoom Out Card Preview')).toBeInTheDocument();
    });

    it('reflects and updates the preview zoom level', async () => {
      const user = userEvent.setup();
      render(<CardPreview />);
      expect(screen.getByTitle('Reset Card Preview Zoom')).toHaveTextContent('1.0×');
      await user.click(screen.getByTitle('Zoom In Card Preview'));
      expect(useCardPreviewStore.getState().zoom).toBeCloseTo(1.1);
      expect(screen.getByTitle('Reset Card Preview Zoom')).toHaveTextContent('1.1×');
    });
  });
});
