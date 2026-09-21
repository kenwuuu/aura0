import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { FoilStorePromo } from './FoilStorePromo';
import { MIN_VISITS_TO_PROMOTE, consumeOpenedByPromo } from './foilPromo';
import { FOIL_STYLE_NEBULA, useCosmeticsStore } from './cosmeticsStore';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { recordVisit } from '@/shared/services/visitCount';

function arriveWith(priorVisits: number): void {
  localStorage.setItem('aura-visit-count', String(priorVisits));
  recordVisit();
}

describe('FoilStorePromo', () => {
  beforeEach(() => {
    localStorage.clear();
    useCosmeticsStore.setState({ entitlements: {} });
    useSettingsModalStore.setState({ isOpen: false, initialSectionId: undefined });
    consumeOpenedByPromo();
  });

  it('opens Settings on the cosmetics section for a long-time player', () => {
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);

    render(<FoilStorePromo />);

    expect(useSettingsModalStore.getState()).toMatchObject({
      isOpen: true,
      initialSectionId: 'cosmetics',
    });
  });

  it('opens nothing for a new player', () => {
    arriveWith(0);

    render(<FoilStorePromo />);

    expect(useSettingsModalStore.getState().isOpen).toBe(false);
  });

  it('opens nothing for someone who already owns it', () => {
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    useCosmeticsStore.setState({ entitlements: { [FOIL_STYLE_NEBULA]: true } });

    render(<FoilStorePromo />);

    expect(useSettingsModalStore.getState().isOpen).toBe(false);
  });

  it('does not reopen on the next visit', () => {
    // The seen-marker is written on open rather than on close, so a player who
    // reloaded with the modal up has still seen it. Two mounts stand in for two
    // page loads.
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    render(<FoilStorePromo />);
    expect(useSettingsModalStore.getState().isOpen).toBe(true);

    useSettingsModalStore.setState({ isOpen: false, initialSectionId: undefined });
    arriveWith(MIN_VISITS_TO_PROMOTE + 2);
    render(<FoilStorePromo />);

    expect(useSettingsModalStore.getState().isOpen).toBe(false);
  });

  it('labels the open it caused, and only that one', () => {
    // `foil_store_viewed` splits prompted views from sought-out ones, which is
    // how the prompt gets judged separately from the product. A later manual
    // visit in the same session must not inherit the label.
    arriveWith(MIN_VISITS_TO_PROMOTE + 1);
    render(<FoilStorePromo />);

    expect(consumeOpenedByPromo()).toBe(true);
    expect(consumeOpenedByPromo()).toBe(false);
  });
});
