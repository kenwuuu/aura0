import { TourOverlay } from './TourOverlay';
import { useTourProgress } from './useTourProgress';

/**
 * Mount point for the first-run tour: starts it for new players, watches the
 * game to advance it, and draws it. Renders nothing for everyone else.
 */
export function OnboardingTour() {
  useTourProgress();
  return <TourOverlay />;
}
