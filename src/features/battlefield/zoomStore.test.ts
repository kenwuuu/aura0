import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, useZoomStore } from './zoomStore';

describe('zoomStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useZoomStore.setState({ zoomLevel: 1 });
  });

  it('defaults to a zoom level of 1', () => {
    expect(useZoomStore.getState().zoomLevel).toBe(1);
  });

  describe('setZoom', () => {
    it('sets the zoom level to the given value', () => {
      useZoomStore.getState().setZoom(1.5);
      expect(useZoomStore.getState().zoomLevel).toBe(1.5);
    });

    it('clamps values above MAX_ZOOM', () => {
      useZoomStore.getState().setZoom(MAX_ZOOM + 1);
      expect(useZoomStore.getState().zoomLevel).toBe(MAX_ZOOM);
    });

    it('clamps values below MIN_ZOOM', () => {
      useZoomStore.getState().setZoom(MIN_ZOOM - 1);
      expect(useZoomStore.getState().zoomLevel).toBe(MIN_ZOOM);
    });

    it('allows the exact boundary values', () => {
      useZoomStore.getState().setZoom(MIN_ZOOM);
      expect(useZoomStore.getState().zoomLevel).toBe(MIN_ZOOM);
      useZoomStore.getState().setZoom(MAX_ZOOM);
      expect(useZoomStore.getState().zoomLevel).toBe(MAX_ZOOM);
    });
  });

  describe('adjustZoom', () => {
    it('adds a positive delta to the current level', () => {
      useZoomStore.getState().adjustZoom(0.1);
      expect(useZoomStore.getState().zoomLevel).toBeCloseTo(1.1);
    });

    it('applies a negative delta', () => {
      useZoomStore.getState().adjustZoom(-0.25);
      expect(useZoomStore.getState().zoomLevel).toBeCloseTo(0.75);
    });

    it('clamps when the delta would exceed MAX_ZOOM', () => {
      useZoomStore.setState({ zoomLevel: MAX_ZOOM });
      useZoomStore.getState().adjustZoom(0.5);
      expect(useZoomStore.getState().zoomLevel).toBe(MAX_ZOOM);
    });

    it('clamps when the delta would drop below MIN_ZOOM', () => {
      useZoomStore.setState({ zoomLevel: MIN_ZOOM });
      useZoomStore.getState().adjustZoom(-0.5);
      expect(useZoomStore.getState().zoomLevel).toBe(MIN_ZOOM);
    });

    it('accumulates across multiple calls', () => {
      const { adjustZoom } = useZoomStore.getState();
      adjustZoom(0.1);
      adjustZoom(0.1);
      adjustZoom(0.1);
      expect(useZoomStore.getState().zoomLevel).toBeCloseTo(1.3);
    });
  });

  describe('resetZoom', () => {
    it('returns the zoom level to 1', () => {
      useZoomStore.getState().setZoom(2);
      useZoomStore.getState().resetZoom();
      expect(useZoomStore.getState().zoomLevel).toBe(1);
    });
  });

  describe('persistence', () => {
    it('writes the zoom level to localStorage under "whiteboard-zoom"', () => {
      useZoomStore.getState().setZoom(1.7);
      const persisted = JSON.parse(localStorage.getItem('whiteboard-zoom') ?? '{}');
      expect(persisted.state.zoomLevel).toBe(1.7);
    });
  });
});
