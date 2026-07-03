import { describe, it, expect } from 'vitest';
import { shouldShowOnLeft } from './cardPreviewLogic';

describe('shouldShowOnLeft', () => {
  it('anchors to the right (returns false) when the cursor is away from the right edge', () => {
    expect(shouldShowOnLeft(100, 100, 300, 419, 1024)).toBe(false);
  });

  it('flips to the left when the cursor sits in the top-right zone the preview would cover', () => {
    // width*1.1 = 330; innerWidth 1024 -> threshold 694. mouseX 1000 > 694, mouseY 100 < 460.9.
    expect(shouldShowOnLeft(1000, 100, 300, 419, 1024)).toBe(true);
  });

  it('stays right when the cursor is far enough right but too low to be covered', () => {
    expect(shouldShowOnLeft(1000, 500, 300, 419, 1024)).toBe(false);
  });

  it('stays right when the cursor is high enough but not far enough right', () => {
    expect(shouldShowOnLeft(500, 100, 300, 419, 1024)).toBe(false);
  });
});
