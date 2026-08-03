import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, migrateSettings } from './settingsStore';
import { HotkeyPreset } from '@/features/hotkeys/presets';
import { resolveBindings } from '@/features/hotkeys/bindings';

describe('hotkey preferences', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      hotkeyPreset: HotkeyPreset.Default,
      hotkeyOverrides: {},
    });
  });

  describe('setHotkeyBinding', () => {
    it('records an override for one action', () => {
      useSettingsStore.getState().setHotkeyBinding('draw', ['q']);
      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({ draw: ['q'] });
    });

    it('leaves other actions on the preset', () => {
      useSettingsStore.getState().setHotkeyBinding('draw', ['q']);
      const { hotkeyPreset, hotkeyOverrides } = useSettingsStore.getState();
      const bindings = resolveBindings(hotkeyPreset, hotkeyOverrides);
      expect(bindings.draw).toEqual(['q']);
      expect(bindings.moveToDiscard).toEqual(['g']); // still the Default preset
    });

    it('stores a copy, so a caller mutating its array cannot reach into the store', () => {
      const keys = ['q'];
      useSettingsStore.getState().setHotkeyBinding('draw', keys);
      keys.push('z');
      expect(useSettingsStore.getState().hotkeyOverrides.draw).toEqual(['q']);
    });
  });

  describe('resetHotkeyBinding', () => {
    it('drops just that action back to the preset', () => {
      const store = useSettingsStore.getState();
      store.setHotkeyBinding('draw', ['q']);
      store.setHotkeyBinding('flip', ['j']);
      store.resetHotkeyBinding('draw');

      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({ flip: ['j'] });
    });
  });

  describe('resetAllHotkeys', () => {
    it('clears every override but keeps the chosen preset', () => {
      const store = useSettingsStore.getState();
      store.setHotkeyBinding('draw', ['q']);
      store.setHotkeyBinding('flip', ['j']);
      store.resetAllHotkeys();

      const state = useSettingsStore.getState();
      expect(state.hotkeyOverrides).toEqual({});
      expect(state.hotkeyPreset).toBe(HotkeyPreset.Default);
    });
  });

  describe('setHotkeyPreset', () => {
    it('drops overrides, which were expressed against the old scheme', () => {
      const store = useSettingsStore.getState();
      store.setHotkeyBinding('draw', ['q']);
      store.setHotkeyPreset(HotkeyPreset.Moxfield);

      const state = useSettingsStore.getState();
      expect(state.hotkeyPreset).toBe(HotkeyPreset.Moxfield);
      expect(state.hotkeyOverrides).toEqual({});
    });
  });
});

/**
 * The whole point of shipping `Default` to new users only.
 *
 * This failure mode is invisible: settings look fine, nothing errors, the keys
 * have just moved under a returning player mid-game. It can only be reproduced
 * by hand with a stale localStorage blob, so it gets a test instead.
 */
describe('migrateSettings', () => {
  it('pins a player who predates customizable hotkeys to Untap', () => {
    const v1Blob = { handZoom: 1.2, previewZoom: 1, snapToGridEnabled: true };

    const migrated = migrateSettings(v1Blob, 1);

    expect(migrated.hotkeyPreset).toBe(HotkeyPreset.Untap);
    expect(migrated.hotkeyOverrides).toEqual({});
  });

  it('leaves the rest of an existing blob untouched', () => {
    const v1Blob = { handZoom: 1.2, previewZoom: 1, snapToGridEnabled: true };

    const migrated = migrateSettings(v1Blob, 1) as unknown as typeof v1Blob;

    expect(migrated.handZoom).toBe(1.2);
    expect(migrated.snapToGridEnabled).toBe(true);
  });

  it('still applies the v1 zoom reset for a v0 blob, and pins hotkeys too', () => {
    const v0Blob = { handZoom: 1.8, previewZoom: 2.4 };

    const migrated = migrateSettings(v0Blob, 0);

    expect(migrated.handZoom).toBe(1);
    expect(migrated.previewZoom).toBe(1);
    expect(migrated.hotkeyPreset).toBe(HotkeyPreset.Untap);
  });

  it('does not touch a blob already at the current version', () => {
    const v2Blob = { hotkeyPreset: HotkeyPreset.Moxfield, hotkeyOverrides: { draw: ['q'] } };

    const migrated = migrateSettings(v2Blob, 2);

    expect(migrated.hotkeyPreset).toBe(HotkeyPreset.Moxfield);
    expect(migrated.hotkeyOverrides).toEqual({ draw: ['q'] });
  });

  it('starts a fresh install on Default — migrate never runs for them', () => {
    // Nothing persisted means zustand skips `migrate` entirely and takes the
    // initializer's value, which is what makes the pinning above safe.
    expect(useSettingsStore.getInitialState().hotkeyPreset).toBe(HotkeyPreset.Default);
  });
});
