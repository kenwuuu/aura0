/**
 * Showing the foil store, once, to players likely to care.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 * The store is reachable from Settings and from ⌘K, and both require a player
 * to go looking for something they do not know exists. For a *demand test* that
 * is not merely a marketing gap, it is a measurement bug: with no way to find
 * the store, zero sales cannot be told apart from zero interest, and the feature
 * would be retired on an artifact rather than on an answer.
 *
 * ── Why it is safe to open a modal unprompted ──────────────────────────────
 * The onboarding tour is the only other thing in the app that opens itself on
 * load, and the two can never collide: the tour requires fewer than
 * `MAX_VISITS_TO_ONBOARD` (3) prior visits and this requires more than
 * {@link MIN_VISITS_TO_PROMOTE} (10). The announcement and patch-notes modals
 * are both inert — one hard-returns false, the other is referenced by nothing.
 *
 * ── The two things that keep it from being a nag ───────────────────────────
 * It is shown once ever, and never to someone who already owns the cosmetic.
 * A modal that reopened on every load, or advertised a purchase to the person
 * who already made it, would cost more goodwill than the cosmetic is worth.
 */
import { visitsBeforeThisSession } from '@/shared/services/visitCount';
import { FOIL_STYLE_NEBULA } from './cosmeticsStore';
import { getIsEntitled } from './cosmeticsStore';

/**
 * Prior visits required before the store is worth interrupting someone over.
 *
 * Above the tour's audience by a wide margin, which is what makes the two
 * mutually exclusive rather than merely unlikely to overlap. Someone on their
 * eleventh visit has decided they use this app; someone on their second has not,
 * and selling them a cosmetic before they have played a game is the wrong ask.
 */
export const MIN_VISITS_TO_PROMOTE = 10;

/**
 * Its own key, deliberately not a field on the cosmetics store.
 *
 * That store's `merge` reads exactly one field and drops everything else, which
 * is what keeps a hand-edited entitlements blob from breaking redemption. Adding
 * an unrelated flag there would mean widening that reader for something that is
 * not an entitlement.
 */
const PROMO_SEEN_KEY = 'aura:foil-promo-seen';

/** Whether this browser has already been shown the store unprompted. */
function hasSeenPromo(): boolean {
  try {
    return localStorage.getItem(PROMO_SEEN_KEY) !== null;
  } catch {
    // A browser with storage blocked cannot remember having been shown this, and
    // a modal that reappears every load is worse than one that never appears.
    return true;
  }
}

/** Remember that it has been shown, so it never opens by itself again. */
export function markFoilPromoSeen(): void {
  try {
    localStorage.setItem(PROMO_SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to do: `hasSeenPromo` already fails closed for this browser.
  }
}

/**
 * Whether to open the store for this player, right now, unasked.
 *
 * Pure apart from the two reads, so the decision can be tested without a DOM,
 * a modal or a store subscription.
 */
export function shouldPromoteFoil(): boolean {
  if (getIsEntitled(FOIL_STYLE_NEBULA)) {
    return false;
  }
  if (hasSeenPromo()) {
    return false;
  }
  return visitsBeforeThisSession() > MIN_VISITS_TO_PROMOTE;
}

/**
 * Whether the *next* render of the store was caused by this module.
 *
 * Transient and deliberately not persisted: it exists only to let the store
 * label one analytics event, and it is consumed on read so a later manual visit
 * in the same session is never miscounted as promoted.
 */
let openedByPromo = false;

/** Called by the promo just before it opens the store. */
export function markOpenedByPromo(): void {
  openedByPromo = true;
}

/** Read-and-clear. Returns true only for the open the promo itself caused. */
export function consumeOpenedByPromo(): boolean {
  const wasPromo = openedByPromo;
  openedByPromo = false;
  return wasPromo;
}
