import { describe, it, expect } from 'vitest';
import { isPileViewDisabled, resolvePileOpenRequest } from './pileNodeLogic';

describe('isPileViewDisabled', () => {
  it('is disabled for an opponent hand the owner has not opted to share', () => {
    expect(isPileViewDisabled({ isLocal: false, pileKind: 'hand', allowViewHand: false })).toBe(true);
  });

  it('is not disabled once the owner allows viewing their hand', () => {
    expect(isPileViewDisabled({ isLocal: false, pileKind: 'hand', allowViewHand: true })).toBe(false);
  });

  it('never disables the local hand', () => {
    expect(isPileViewDisabled({ isLocal: true, pileKind: 'hand', allowViewHand: false })).toBe(false);
  });

  it('never disables a non-private pile', () => {
    expect(isPileViewDisabled({ isLocal: false, pileKind: 'exile', allowViewHand: false })).toBe(false);
  });

  it("disables an opponent's sideboard", () => {
    expect(isPileViewDisabled({ isLocal: false, pileKind: 'sideboard', allowViewHand: false })).toBe(true);
  });

  it("keeps an opponent's sideboard disabled even when they share their hand", () => {
    // A sideboard has no opt-in of its own, and `allowViewHand` is not it —
    // sharing a hand must never be a back door into the sideboard.
    expect(isPileViewDisabled({ isLocal: false, pileKind: 'sideboard', allowViewHand: true })).toBe(true);
  });

  it('never disables the local sideboard', () => {
    expect(isPileViewDisabled({ isLocal: true, pileKind: 'sideboard', allowViewHand: false })).toBe(false);
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

  it("never opens an opponent's deck, whatever the hand-share flag", () => {
    // The deck's full order is private to its owner; only they open it (locally).
    // There is no opponent-scope deck viewer, so a click must resolve to nothing.
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'deck', allowViewHand: false }),
    ).toBeNull();
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'deck', allowViewHand: true }),
    ).toBeNull();
  });

  it('opens the local viewer for the local sideboard', () => {
    expect(
      resolvePileOpenRequest({ ownerId: 'p1', isLocal: true, pileKind: 'sideboard', allowViewHand: false }),
    ).toEqual({ scope: 'local', pile: 'sideboard' });
  });

  it("never opens an opponent's sideboard", () => {
    // The one pile with no viewer at all for anyone but its owner. Clicking an
    // opponent's sideboard has to resolve to nothing, or the count on the board
    // becomes a door into the contents.
    expect(
      resolvePileOpenRequest({ ownerId: 'p2', isLocal: false, pileKind: 'sideboard', allowViewHand: true }),
    ).toBeNull();
  });
});
