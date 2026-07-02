import { describe, it, expect } from 'vitest';
import { isHandViewDisabled, resolvePileOpenRequest } from './pileNodeLogic';

describe('isHandViewDisabled', () => {
  it('is disabled for an opponent hand the owner has not opted to share', () => {
    expect(isHandViewDisabled({ isLocal: false, pileKind: 'hand', allowViewHand: false })).toBe(true);
  });

  it('is not disabled once the owner allows viewing their hand', () => {
    expect(isHandViewDisabled({ isLocal: false, pileKind: 'hand', allowViewHand: true })).toBe(false);
  });

  it('never disables the local hand', () => {
    expect(isHandViewDisabled({ isLocal: true, pileKind: 'hand', allowViewHand: false })).toBe(false);
  });

  it('never disables a non-hand pile', () => {
    expect(isHandViewDisabled({ isLocal: false, pileKind: 'exile', allowViewHand: false })).toBe(false);
  });
});

describe('resolvePileOpenRequest', () => {
  it('opens the local viewer for a local deck/exile/discard pile', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p1', isLocal: true, pileKind: 'deck', allowViewHand: false }),
    ).toEqual({ scope: 'local', pile: 'deck' });
  });

  it('does not open a request for the local hand pile', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p1', isLocal: true, pileKind: 'hand', allowViewHand: false }),
    ).toBeNull();
  });

  it('opens the opponent viewer for an opponent exile/discard pile', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'discard', allowViewHand: false }),
    ).toEqual({ scope: 'opponent', playerId: 'p2', pile: 'discard' });
  });

  it('opens the opponent hand viewer once viewing is allowed', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'hand', allowViewHand: true }),
    ).toEqual({ scope: 'opponent', playerId: 'p2', pile: 'hand' });
  });

  it('does not open a request for a gated opponent hand', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'hand', allowViewHand: false }),
    ).toBeNull();
  });
});
