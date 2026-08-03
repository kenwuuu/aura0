/**
 * The "click, then press a key" control for one action's binding.
 *
 * Owns the recording lifecycle, including the part that isn't obvious: while
 * recording it sets `isCapturingHotkey`, which switches the app to
 * `HotkeyScope.Capture` so the keystroke being recorded doesn't also play the
 * game. The Settings modal never sets `isModalOpen`, so board hotkeys are
 * otherwise fully live here — without this, recording `D` would draw a card.
 *
 * Listening happens on `window` in the capture phase rather than via the
 * button's own `onKeyDown`, so keys the button would otherwise consume (Space
 * and Enter both "click" a focused button) can be bound like any other.
 */
import React, { useCallback, useEffect } from 'react';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { formatKeyBinding, serializeKeyEvent } from '@/features/hotkeys/bindings';
import styles from './HotkeyCaptureButton.module.css';

interface HotkeyCaptureButtonProps {
  /** Label the control announces, e.g. "Draw". */
  actionLabel: string;
  /** The keys currently bound, in react-hotkeys-hook syntax. */
  keys: readonly string[];
  /** True while this button is the one recording. */
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** A key was captured. Receives one rhk binding string. */
  onCapture: (binding: string) => void;
}

export function HotkeyCaptureButton({
  actionLabel,
  keys,
  isRecording,
  onStartRecording,
  onStopRecording,
  onCapture,
}: HotkeyCaptureButtonProps) {
  const setCapturingHotkey = useHotkeyStore((s) => s.setCapturingHotkey);

  // Flag the app as capturing for exactly as long as this button is recording.
  // The cleanup matters as much as the set: unmounting mid-record (closing
  // Settings with a row armed) would otherwise leave every game hotkey dead.
  useEffect(() => {
    if (!isRecording) return;
    setCapturingHotkey(true);
    return () => setCapturingHotkey(false);
  }, [isRecording, setCapturingHotkey]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Escape cancels rather than binding — it's the modal's own dismiss key,
      // and binding it would make the pile viewer uncloseable.
      if (event.code === 'Escape') {
        onStopRecording();
        return;
      }

      // null while only a modifier is held, so you can hold ⇧ and then pick.
      const binding = serializeKeyEvent(event);
      if (!binding) return;

      onCapture(binding);
      onStopRecording();
    },
    [onCapture, onStopRecording],
  );

  useEffect(() => {
    if (!isRecording) return;
    // Capture phase: this must win against react-hotkeys-hook's own document
    // listener and against the button's default Space/Enter activation.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, handleKeyDown]);

  const label = formatKeyBinding(keys);

  return (
    <button
      type="button"
      className={styles.capture}
      data-recording={isRecording || undefined}
      data-testid={`hotkey-capture-${actionLabel}`}
      aria-label={
        isRecording
          ? `Press a key to bind to ${actionLabel}, or Escape to cancel`
          : `Change the key for ${actionLabel}. Currently ${label || 'unbound'}`
      }
      onClick={() => (isRecording ? onStopRecording() : onStartRecording())}
      // Losing focus ends recording — otherwise an armed row would keep
      // swallowing every keystroke in the app after you clicked away.
      onBlur={() => isRecording && onStopRecording()}
    >
      {isRecording ? 'Press a key…' : label || 'Unbound'}
    </button>
  );
}
