import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore panel positions', () => {
  beforeEach(() => {
    useSettingsStore.setState({ panelPositions: {} });
  });

  it('starts with no saved positions', () => {
    expect(useSettingsStore.getState().panelPositions).toEqual({});
  });

  it('setPanelPosition saves a position under its key', () => {
    useSettingsStore.getState().setPanelPosition('toolbar', { x: 10, y: 20 });
    expect(useSettingsStore.getState().panelPositions.toolbar).toEqual({ x: 10, y: 20 });
  });

  it('updates one panel without clobbering the others', () => {
    const { setPanelPosition } = useSettingsStore.getState();
    setPanelPosition('a', { x: 1, y: 1 });
    setPanelPosition('b', { x: 2, y: 2 });
    setPanelPosition('a', { x: 9, y: 9 });
    expect(useSettingsStore.getState().panelPositions).toEqual({
      a: { x: 9, y: 9 },
      b: { x: 2, y: 2 },
    });
  });
});
