import type { Page } from '@playwright/test';
import { resolveBindings } from '../../../src/features/hotkeys/bindings';
import { HotkeyPreset, type HotkeyPresetId } from '../../../src/features/hotkeys/presets';

/**
 * Press the key bound to a game action, rather than a literal letter.
 *
 * Specs used to call `page.keyboard.press('d')` and mean "discard". Once keys
 * became customizable that stopped being a fact about the app and became a fact
 * about one preset — and the failure is silent rather than loud: on the Default
 * preset `d` still does something, it just draws instead of discarding, so the
 * spec fails on an assertion three steps later with no hint why.
 *
 * Naming the action keeps specs testing behaviour instead of a keyboard layout,
 * and means a future preset change touches this file and nothing else.
 */

/**
 * The preset the app boots with for a spec that hasn't seeded settings.
 *
 * Must track `hotkeyPreset`'s initial value in `settingsStore.ts`. Returning
 * users are migrated to `Untap`, but a Playwright context starts with empty
 * localStorage, so it is always a "new install" here.
 */
export const E2E_DEFAULT_PRESET: HotkeyPresetId = HotkeyPreset.Default;

/**
 * Convert a react-hotkeys-hook binding into a Playwright key descriptor.
 *
 * rhk binds physical keys (`event.code`), so this rebuilds the code Playwright
 * should synthesise — the inverse of `normalizeKeyCode`. Going through codes
 * rather than characters keeps `shift+equal` unambiguous: pressing `Shift+Equal`
 * produces both the `+` character and the `Equal` code, so it matches whether a
 * binding was written either way.
 */
export function toPlaywrightKey(binding: string): string {
  const parts = binding.split('+').filter(Boolean);
  const base = parts.pop() ?? '';
  const modifiers = parts.map((m) => {
    switch (m) {
      case 'ctrl':
      case 'control': return 'Control';
      case 'alt': return 'Alt';
      case 'shift': return 'Shift';
      case 'meta':
      case 'mod': return 'Meta';
      default: return m;
    }
  });

  let code: string;
  if (/^[a-z]$/.test(base)) code = `Key${base.toUpperCase()}`;
  else if (/^[0-9]$/.test(base)) code = `Digit${base}`;
  else code = base.charAt(0).toUpperCase() + base.slice(1); // space → Space, arrowup → Arrowup

  // Playwright's code names are camel-cased; the few multi-word ones we bind
  // need their inner capital back.
  const CAMEL: Record<string, string> = {
    Arrowup: 'ArrowUp',
    Arrowdown: 'ArrowDown',
    Arrowleft: 'ArrowLeft',
    Arrowright: 'ArrowRight',
    Bracketleft: 'BracketLeft',
    Bracketright: 'BracketRight',
    Capslock: 'CapsLock',
  };
  code = CAMEL[code] ?? code;

  return [...modifiers, code].join('+');
}

/** The keys bound to `action` under `preset`, as Playwright descriptors. */
export function keysForAction(
  action: string,
  preset: HotkeyPresetId = E2E_DEFAULT_PRESET,
): string[] {
  return (resolveBindings(preset)[action] ?? []).map(toPlaywrightKey);
}

/**
 * Press the first key bound to `action`.
 *
 * Throws rather than no-oping on an unbound action: a silently skipped keypress
 * would leave the spec asserting against unchanged state, which reads as a
 * product bug instead of a typo'd action id.
 */
export async function pressHotkey(
  page: Page,
  action: string,
  options: { preset?: HotkeyPresetId } = {},
): Promise<void> {
  const keys = keysForAction(action, options.preset);
  if (keys.length === 0) {
    throw new Error(
      `No key is bound to "${action}" in the ${options.preset ?? E2E_DEFAULT_PRESET} preset. ` +
        'Check the action id against HOTKEYS.',
    );
  }
  await page.keyboard.press(keys[0]);
}
