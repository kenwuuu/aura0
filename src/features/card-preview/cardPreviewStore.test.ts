import { beforeEach, describe, expect, it } from 'vitest';
import type { Card } from '@/features/player/types';
import { MAX_ZOOM, MIN_ZOOM, useCardPreviewStore } from './cardPreviewStore';

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
      zoom: 1,
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

  describe('zoom', () => {
    it('setZoom clamps to the allowed range', () => {
      useCardPreviewStore.getState().setZoom(MAX_ZOOM + 5);
      expect(useCardPreviewStore.getState().zoom).toBe(MAX_ZOOM);
      useCardPreviewStore.getState().setZoom(MIN_ZOOM - 5);
      expect(useCardPreviewStore.getState().zoom).toBe(MIN_ZOOM);
    });

    it('adjustZoom applies and clamps a delta', () => {
      useCardPreviewStore.getState().adjustZoom(0.1);
      expect(useCardPreviewStore.getState().zoom).toBeCloseTo(1.1);
      useCardPreviewStore.setState({ zoom: MIN_ZOOM });
      useCardPreviewStore.getState().adjustZoom(-1);
      expect(useCardPreviewStore.getState().zoom).toBe(MIN_ZOOM);
    });

    it('resetZoom returns to 1', () => {
      useCardPreviewStore.getState().setZoom(2);
      useCardPreviewStore.getState().resetZoom();
      expect(useCardPreviewStore.getState().zoom).toBe(1);
    });
  });

  describe('persistence (partialize)', () => {
    it('persists only the zoom level, not the card/visibility/cursor', () => {
      useCardPreviewStore.getState().setZoom(1.6);
      useCardPreviewStore.getState().show(makeCard());
      useCardPreviewStore.getState().updatePosition(50, 60);

      const persisted = JSON.parse(localStorage.getItem('card-preview-zoom') ?? '{}');
      expect(persisted.state).toEqual({ zoom: 1.6 });
      expect(persisted.state.card).toBeUndefined();
      expect(persisted.state.isVisible).toBeUndefined();
      expect(persisted.state.mouseX).toBeUndefined();
    });
  });
});
