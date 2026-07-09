import { describe, it, expect } from 'vitest';
import { isOwnToken, applyTokenDelta, clickedTopHalf } from './tokenNodeLogic';

describe('isOwnToken', () => {
  it('is true when the token owner is the local player', () => {
    expect(isOwnToken('p1', 'p1')).toBe(true);
  });

  it('is false when the token owner is someone else', () => {
    expect(isOwnToken('p1', 'p2')).toBe(false);
  });
});

describe('applyTokenDelta', () => {
  it('adds the delta to the current count', () => {
    expect(applyTokenDelta(3, 1)).toBe(4);
    expect(applyTokenDelta(3, -1)).toBe(2);
  });

  it('treats a missing count as 0', () => {
    expect(applyTokenDelta(undefined, 1)).toBe(1);
  });
});

describe('clickedTopHalf', () => {
  it('is true for a click in the top half', () => {
    expect(clickedTopHalf(5, 0, 20)).toBe(true);
  });

  it('is false for a click in the bottom half', () => {
    expect(clickedTopHalf(15, 0, 20)).toBe(false);
  });

  it('is false exactly at the midpoint', () => {
    expect(clickedTopHalf(10, 0, 20)).toBe(false);
  });

  it('accounts for the element not starting at y=0', () => {
    expect(clickedTopHalf(105, 100, 20)).toBe(true);
    expect(clickedTopHalf(115, 100, 20)).toBe(false);
  });
});
