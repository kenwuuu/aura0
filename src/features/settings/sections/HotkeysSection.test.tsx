import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysSection } from './HotkeysSection';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { HotkeyPreset } from '@/features/hotkeys/presets';

/** The capture control for an action, addressed by its visible label. */
const captureFor = (label: string) =>
  screen.getByTestId(`hotkey-capture-${label}`);

describe('HotkeysSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      hotkeyPreset: HotkeyPreset.Untap,
      hotkeyOverrides: {},
    });
    useConfirmStore.setState({ request: null });
    useHotkeyStore.setState({ isCapturingHotkey: false });
  });

  describe('presets', () => {
    it('shows the current preset', () => {
      render(<HotkeysSection />);
      expect(screen.getByRole('combobox', { name: 'Keyboard scheme' })).toHaveTextContent('Untap');
    });

    it('shows each action with the key its preset binds', () => {
      useSettingsStore.setState({ hotkeyPreset: HotkeyPreset.Default });
      render(<HotkeysSection />);

      expect(captureFor('Draw')).toHaveTextContent('D');
      expect(captureFor('Untap all')).toHaveTextContent('U');
      expect(captureFor('Discard')).toHaveTextContent('G');
    });

    it('shows Untap keys on the Untap preset', () => {
      render(<HotkeysSection />);

      expect(captureFor('Draw')).toHaveTextContent('C');
      expect(captureFor('Untap all')).toHaveTextContent('X');
      expect(captureFor('Discard')).toHaveTextContent('D');
    });
  });

  describe('rebinding', () => {
    it('records the key you press', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('q');

      expect(useSettingsStore.getState().hotkeyOverrides.draw).toEqual(['q']);
    });

    it('shows the new key immediately', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('q');

      expect(captureFor('Draw')).toHaveTextContent('Q');
    });

    it('prompts while armed', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));

      expect(captureFor('Draw')).toHaveTextContent('Press a key…');
    });

    /**
     * The Settings modal never sets `isModalOpen`, so board hotkeys are live
     * here. Arming a row has to suppress them or recording D also draws a card.
     */
    it('suppresses game hotkeys while armed', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      expect(useHotkeyStore.getState().isCapturingHotkey).toBe(true);
    });

    it('stops suppressing them once a key lands', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('q');

      expect(useHotkeyStore.getState().isCapturingHotkey).toBe(false);
    });

    it('cancels on Escape without binding it', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('{Escape}');

      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({});
      expect(captureFor('Draw')).toHaveTextContent('C');
      expect(useHotkeyStore.getState().isCapturingHotkey).toBe(false);
    });

    it('keeps waiting while only a modifier is held', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('{Shift>}');

      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({});
      expect(captureFor('Draw')).toHaveTextContent('Press a key…');
    });
  });

  describe('conflicts', () => {
    it('warns when the key already belongs to another action', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('f'); // F is Flip on the Untap preset

      expect(screen.getByTestId('hotkey-conflict')).toHaveTextContent('Flip');
    });

    it('binds it anyway — a shared key can be legitimate', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('f');

      expect(useSettingsStore.getState().hotkeyOverrides.draw).toEqual(['f']);
    });

    it('unbinds the other action on request, keeping the new binding', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('f');
      await user.click(screen.getByRole('button', { name: /unbind it/i }));

      const { hotkeyOverrides } = useSettingsStore.getState();
      expect(hotkeyOverrides.draw).toEqual(['f']);
      expect(hotkeyOverrides.flip).toEqual([]);
      expect(screen.queryByTestId('hotkey-conflict')).not.toBeInTheDocument();
    });

    it('says nothing when the key is free', async () => {
      const user = userEvent.setup();
      render(<HotkeysSection />);

      await user.click(captureFor('Draw'));
      await user.keyboard('q');

      expect(screen.queryByTestId('hotkey-conflict')).not.toBeInTheDocument();
    });
  });

  describe('reset', () => {
    it('offers no per-row reset until the row differs from the preset', () => {
      render(<HotkeysSection />);
      expect(screen.queryByTestId('reset-hotkey-draw')).not.toBeInTheDocument();
    });

    it('resets one action back to the preset', async () => {
      const user = userEvent.setup();
      useSettingsStore.setState({ hotkeyOverrides: { draw: ['q'], flip: ['j'] } });
      render(<HotkeysSection />);

      await user.click(screen.getByTestId('reset-hotkey-draw'));

      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({ flip: ['j'] });
      expect(captureFor('Draw')).toHaveTextContent('C');
    });

    it('hides Reset all until something has been changed', () => {
      render(<HotkeysSection />);
      expect(screen.queryByTestId('reset-all-hotkeys')).not.toBeInTheDocument();
    });

    it('counts the changed keys', () => {
      useSettingsStore.setState({ hotkeyOverrides: { draw: ['q'], flip: ['j'] } });
      render(<HotkeysSection />);

      expect(screen.getByText(/2 keys changed/)).toBeInTheDocument();
    });

    it('asks before resetting everything', async () => {
      const user = userEvent.setup();
      useSettingsStore.setState({ hotkeyOverrides: { draw: ['q'] } });
      render(<HotkeysSection />);

      await user.click(screen.getByTestId('reset-all-hotkeys'));

      const request = useConfirmStore.getState().request;
      expect(request?.title).toBe('Reset all hotkeys?');
      expect(request?.destructive).toBe(true);
      // Not yet applied — the dialog hasn't been confirmed.
      expect(useSettingsStore.getState().hotkeyOverrides).toEqual({ draw: ['q'] });
    });

    it('clears every override once confirmed, keeping the preset', async () => {
      const user = userEvent.setup();
      useSettingsStore.setState({
        hotkeyPreset: HotkeyPreset.Moxfield,
        hotkeyOverrides: { draw: ['q'], flip: ['j'] },
      });
      render(<HotkeysSection />);

      await user.click(screen.getByTestId('reset-all-hotkeys'));
      useConfirmStore.getState().request?.onConfirm();

      const state = useSettingsStore.getState();
      expect(state.hotkeyOverrides).toEqual({});
      expect(state.hotkeyPreset).toBe(HotkeyPreset.Moxfield);
    });
  });
});
