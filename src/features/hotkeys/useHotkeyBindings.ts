/**
 * Reactive access to the player's effective key bindings.
 *
 * `bindings.ts` stays pure so the e2e harness can resolve the same keys the app
 * will press; this is the thin layer that reads the persisted preset/overrides
 * and re-derives on change.
 *
 * The re-derivation matters: `useAllGameHotkeys` passes these arrays straight to
 * `useHotkeys`, and rhk re-registers its listener when the joined key string
 * changes. So a rebind takes effect on the next render, with no reload and no
 * imperative unbind step.
 */

import { useMemo } from 'react';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { resolveBindings, type EffectiveBindings } from '@/features/hotkeys/bindings';

/** The action → keys map for the current preset and overrides. */
export function useEffectiveBindings(): EffectiveBindings {
  const preset = useSettingsStore((s) => s.hotkeyPreset);
  const overrides = useSettingsStore((s) => s.hotkeyOverrides);
  // Memoized on the two store slices: `resolveBindings` walks the whole catalog,
  // and this hook is read by surfaces that render on every hover change.
  return useMemo(() => resolveBindings(preset, overrides), [preset, overrides]);
}

/**
 * Non-reactive read, for call sites outside React (executors, imperative
 * helpers). Prefer `useEffectiveBindings` in components so they re-render.
 */
export function getEffectiveBindings(): EffectiveBindings {
  const { hotkeyPreset, hotkeyOverrides } = useSettingsStore.getState();
  return resolveBindings(hotkeyPreset, hotkeyOverrides);
}
