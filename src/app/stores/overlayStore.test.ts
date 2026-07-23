import { describe, it, expect, beforeEach } from 'vitest';
import { useOverlayStore } from './overlayStore';

const reset = () =>
  useOverlayStore.setState({
    commandPaletteOpen: false,
    helpOpen: false,
    deckSelectionOpen: false,
  });

describe('overlayStore', () => {
  beforeEach(reset);

  it('open/close flip the matching `${key}Open` field only', () => {
    useOverlayStore.getState().open('help');
    expect(useOverlayStore.getState().helpOpen).toBe(true);
    // Other overlays are untouched.
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(false);
    expect(useOverlayStore.getState().deckSelectionOpen).toBe(false);

    useOverlayStore.getState().close('help');
    expect(useOverlayStore.getState().helpOpen).toBe(false);
  });

  it('toggle flips the current value', () => {
    const { toggle } = useOverlayStore.getState();
    toggle('commandPalette');
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(true);
    toggle('commandPalette');
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(false);
  });

  it('set writes an explicit boolean', () => {
    useOverlayStore.getState().set('deckSelection', true);
    expect(useOverlayStore.getState().deckSelectionOpen).toBe(true);
    useOverlayStore.getState().set('deckSelection', false);
    expect(useOverlayStore.getState().deckSelectionOpen).toBe(false);
  });
});