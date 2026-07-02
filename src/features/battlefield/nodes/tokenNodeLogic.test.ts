import { describe, it, expect } from 'vitest';
import { isOwnToken, applyTokenDelta } from './tokenNodeLogic';

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
