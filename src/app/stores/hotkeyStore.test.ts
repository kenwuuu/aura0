import { describe, it, expect, afterEach } from 'vitest';
import { useHotkeyStore } from './hotkeyStore';

afterEach(() => useHotkeyStore.getState().reset());

describe('hotkeyStore selection', () => {
  it('round-trips the selected card ids', () => {
    useHotkeyStore.getState().setSelectedCardIds(new Set(['a', 'b']));
    expect(useHotkeyStore.getState().selectedCardIds).toEqual(new Set(['a', 'b']));
  });

  it('starts empty', () => {
    expect(useHotkeyStore.getState().selectedCardIds.size).toBe(0);
  });

  it('reset() clears the selection along with the hover target', () => {
    useHotkeyStore.getState().setHoveredBattlefieldCard('card-1');
    useHotkeyStore.getState().setSelectedCardIds(new Set(['a']));

    useHotkeyStore.getState().reset();

    expect(useHotkeyStore.getState().hoverTarget).toBeNull();
    expect(useHotkeyStore.getState().selectedCardIds.size).toBe(0);
  });
});
