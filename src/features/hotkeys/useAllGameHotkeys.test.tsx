import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameHotkeysManager } from './GameHotkeysManager';
import { renderWithGame } from '@/test/harness';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { HotkeyPreset } from './presets';
import * as gameActions from './gameActions';

/**
 * The keyboard layer, exercised through real keypresses.
 *
 * These cover the part of customization that unit-testing `resolveBindings`
 * can't reach: that a rebind actually re-registers with react-hotkeys-hook, and
 * that recording a key doesn't also play the game. Both failure modes are
 * silent — the app renders correctly and the wrong thing happens.
 */
describe('useAllGameHotkeys bindings', () => {
  let dispatch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatch = vi.spyOn(gameActions, 'dispatchGameAction').mockImplementation(() => {});
    useSettingsStore.setState({
      hotkeyPreset: HotkeyPreset.Untap,
      hotkeyOverrides: {},
    });
    useHotkeyStore.setState({ isCapturingHotkey: false, isModalOpen: false });
  });

  afterEach(() => {
    dispatch.mockRestore();
  });

  /** Actions dispatched so far, ignoring their targets. */
  const dispatched = (): string[] =>
    dispatch.mock.calls.map((call: unknown[]) => call[0] as string);

  it('fires the preset key', async () => {
    renderWithGame(<GameHotkeysManager />);

    await userEvent.keyboard('c'); // Untap preset: C draws

    expect(dispatched()).toContain('draw');
  });

  it('fires a different key once the preset changes', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useSettingsStore.getState().setHotkeyPreset(HotkeyPreset.Default);
    });

    await userEvent.keyboard('d'); // Default preset: D draws
    expect(dispatched()).toContain('draw');
  });

  it('stops firing the old key after a preset change', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useSettingsStore.getState().setHotkeyPreset(HotkeyPreset.Default);
    });

    await userEvent.keyboard('c'); // C is Copy on Default, and needs a hovered card
    expect(dispatched()).not.toContain('draw');
  });

  it('honours a per-action override over the preset', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useSettingsStore.getState().setHotkeyBinding('draw', ['q']);
    });

    await userEvent.keyboard('q');
    expect(dispatched()).toContain('draw');
  });

  it('re-registers live, without a remount', async () => {
    // The whole promise of the settings UI: rebind and it works immediately.
    renderWithGame(<GameHotkeysManager />);

    await userEvent.keyboard('c');
    expect(dispatched()).toContain('draw');
    dispatch.mockClear();

    act(() => {
      useSettingsStore.getState().setHotkeyBinding('draw', ['q']);
    });

    await userEvent.keyboard('c');
    expect(dispatched(), 'old key should be dead').not.toContain('draw');

    await userEvent.keyboard('q');
    expect(dispatched(), 'new key should be live').toContain('draw');
  });

  /**
   * The Settings modal never sets `isModalOpen`, so board hotkeys are live while
   * it's open. Without the Capture scope, pressing D to *record* it would draw a
   * card too — and you'd only notice by watching your hand grow.
   */
  it('fires nothing while a key is being recorded', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useHotkeyStore.getState().setCapturingHotkey(true);
    });

    await userEvent.keyboard('c');
    expect(dispatched()).toEqual([]);
  });

  it('resumes firing once recording ends', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useHotkeyStore.getState().setCapturingHotkey(true);
    });
    await userEvent.keyboard('c');
    expect(dispatched()).toEqual([]);

    act(() => {
      useHotkeyStore.getState().setCapturingHotkey(false);
    });
    await userEvent.keyboard('c');
    expect(dispatched()).toContain('draw');
  });

  it('does not fire an action the player has left unbound', async () => {
    renderWithGame(<GameHotkeysManager />);

    act(() => {
      useSettingsStore.getState().setHotkeyBinding('draw', []);
    });

    await userEvent.keyboard('c');
    expect(dispatched()).not.toContain('draw');
  });
});
