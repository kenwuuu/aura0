/**
 * How many times this browser has loaded Aura before the current visit.
 *
 * The count lives in localStorage, but the *interesting* value — what it was on
 * arrival — is only observable before bootstrap increments it. Capturing it here
 * at boot means later callers (the onboarding tour) can ask "is this a new
 * player?" without re-deriving it from an already-mutated key.
 */

const VISIT_COUNT_KEY = 'aura-visit-count';

/**
 * Visits before this one. 0 on a genuinely first load. Null until `recordVisit`
 * runs, which bootstrap does before React mounts.
 */
let visitsBeforeThisOne: number | null = null;

/** Called once from bootstrap. Returns the count *before* this visit. */
export function recordVisit(): number {
  const previous = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10) || 0;
  localStorage.setItem(VISIT_COUNT_KEY, (previous + 1).toString());
  visitsBeforeThisOne = previous;
  return previous;
}

export function visitsBeforeThisSession(): number {
  return visitsBeforeThisOne ?? 0;
}

/**
 * Whether this player is new enough to be worth onboarding.
 *
 * Not "is this their first visit": someone who closed the tab halfway through
 * the tour would then never be offered it again. But not unbounded either —
 * running the tour for long-time players would flood the step-order experiment
 * with people who already know how to play and complete every step instantly,
 * which is worse than a smaller sample.
 */
const MAX_VISITS_TO_ONBOARD = 3;

export function isOnboardingAudience(): boolean {
  return visitsBeforeThisSession() < MAX_VISITS_TO_ONBOARD;
}
