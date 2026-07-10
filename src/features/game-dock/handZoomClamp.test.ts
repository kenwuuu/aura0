import { describe, it, expect } from 'vitest';
import { effectiveHandZoom, PHONE_HAND_ZOOM_CAP } from './handZoomClamp';

describe('effectiveHandZoom', () => {
  it('passes the zoom through untouched on desktop', () => {
    expect(effectiveHandZoom(2, false)).toBe(2);
    expect(effectiveHandZoom(0.5, false)).toBe(0.5);
  });

  it('caps a large persisted desktop zoom on phone', () => {
    expect(effectiveHandZoom(2, true)).toBe(PHONE_HAND_ZOOM_CAP);
    expect(effectiveHandZoom(1, true)).toBe(PHONE_HAND_ZOOM_CAP);
  });

  it('keeps zooms already below the cap on phone', () => {
    expect(effectiveHandZoom(0.5, true)).toBe(0.5);
  });
});
