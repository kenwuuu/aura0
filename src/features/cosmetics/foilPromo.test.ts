import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MIN_VISITS_TO_PROMOTE, markFoilPromoSeen, shouldPromoteFoil } from './foilPromo';
import { FOIL_STYLE_NEBULA, useCosmeticsStore } from './cosmeticsStore';
import { recordVisit } from '@/shared/services/visitCount';

/**
 * Seed the visit counter and run the boot-time capture, which is the only thing
 * that makes `visitsBeforeThisSession()` meaningful — it reads a module-level
 * value that bootstrap fills in before React mounts.
 */
function arriveWith(priorVisits: number): void {
  localStorage.setItem('aura-visit-count', String(priorVisits));
  recordVisit();
}

describe('shouldPromoteFoil', () => {
  beforeEach(() => {
    localStorage.clear();
    useCosmeticsStore.setState({ entitlements: {} });
  });

  it('opens the store for a long-time player', () => {
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);

    expect(shouldPromoteFoil()).toBe(true);
  });

  it('stays shut at exactly the threshold', () => {
    // "More than 10", not "at least 10" — the boundary is the whole gate, and
    // an off-by-one here is the difference between the tour's audience and this
    // one staying disjoint.
    arriveWith(MIN_VISITS_TO_PROMOTE);

    expect(shouldPromoteFoil()).toBe(false);
  });

  it('never fires for a new player', () => {
    // The onboarding tour owns this player. Two modals opening themselves on the
    // same load would be the one way this becomes genuinely obnoxious.
    arriveWith(0);

    expect(shouldPromoteFoil()).toBe(false);
  });

  it('does not advertise a cosmetic to someone who already bought it', () => {
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    useCosmeticsStore.setState({ entitlements: { [FOIL_STYLE_NEBULA]: true } });

    expect(shouldPromoteFoil()).toBe(false);
  });

  it('only ever opens once', () => {
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    expect(shouldPromoteFoil()).toBe(true);

    markFoilPromoSeen();

    // The difference between a prompt and a nag. Every subsequent load for the
    // rest of this browser's life goes through here.
    expect(shouldPromoteFoil()).toBe(false);
  });

  it('stays shut when storage cannot be read', () => {
    // A browser with storage blocked cannot remember having been shown this, so
    // failing open would reopen the modal on every single load — far worse than
    // never showing it.
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    // On the instance, not `Storage.prototype`: happy-dom's localStorage does
    // not inherit `getItem` from the prototype, so a prototype spy never fires.
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(shouldPromoteFoil()).toBe(false);

    vi.restoreAllMocks();
  });
});
