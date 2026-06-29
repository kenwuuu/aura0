import { beforeEach, describe, expect, it } from 'vitest';
import type { Card } from '@/features/player/types';
import { useCardPreviewStore } from './cardPreviewStore';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    cardNumber: 1,
    name: 'Lightning Bolt',
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  };
}

describe('cardPreviewStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCardPreviewStore.setState({
      card: null,
      isVisible: false,
      mouseX: 0,
      mouseY: 0,
    });
  });

  it('starts hidden with no card', () => {
    const state = useCardPreviewStore.getState();
    expect(state.card).toBeNull();
    expect(state.isVisible).toBe(false);
  });

  describe('show / hide', () => {
    it('show sets the card and makes the preview visible', () => {
      const card = makeCard();
      useCardPreviewStore.getState().show(card);
      const state = useCardPreviewStore.getState();
      expect(state.card).toBe(card);
      expect(state.isVisible).toBe(true);
    });

    it('hide clears the card and hides the preview', () => {
      useCardPreviewStore.getState().show(makeCard());
      useCardPreviewStore.getState().hide();
      const state = useCardPreviewStore.getState();
      expect(state.card).toBeNull();
      expect(state.isVisible).toBe(false);
    });
  });

  describe('updatePosition', () => {
    it('stores the latest cursor coordinates', () => {
      useCardPreviewStore.getState().updatePosition(123, 456);
      const state = useCardPreviewStore.getState();
      expect(state.mouseX).toBe(123);
      expect(state.mouseY).toBe(456);
    });
  });
});
