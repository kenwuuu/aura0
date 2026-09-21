import { useEffect } from 'react';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { markFoilPromoSeen, markOpenedByPromo, shouldPromoteFoil } from './foilPromo';

/**
 * Opens the foil store once, unprompted, for a player who has been here a while.
 *
 * Mounts alongside the other root-level modals and renders nothing — the store
 * it opens is a Settings section that is already in the tree, so there is no
 * second modal here, only a decision about whether to show the first one.
 *
 * The seen-marker is written when it opens, not when it closes: a player who
 * reloads mid-modal has still seen it, and tying it to a close handler would
 * reopen it for anyone who dismissed it by navigating away.
 */
export function FoilStorePromo() {
  useEffect(() => {
    if (!shouldPromoteFoil()) {
      return;
    }
    markFoilPromoSeen();
    markOpenedByPromo();
    useSettingsModalStore.getState().open('cosmetics');
  }, []);

  return null;
}
