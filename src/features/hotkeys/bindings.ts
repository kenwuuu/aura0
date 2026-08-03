/**
 * Effective key bindings: catalog → preset → user override.
 *
 * Pure functions only. The reactive wrapper that reads the settings store lives
 * in `useHotkeyBindings.ts`; keeping the resolution itself pure is what lets the
 * e2e harness resolve the same keys the app will press.
 *
 * ## The react-hotkeys-hook contract
 *
 * rhk v5 matches on **`event.code`** (the physical key), not `event.key`,
 * normalizing it as `code.toLowerCase().replace(/key|digit|numpad/, '')` and
 * joining modifiers with `+`. So `KeyD` → `d`, `Equal` → `equal`, `Digit1` → `1`,
 * `BracketRight` → `bracketright`. That's why the catalog says `shift+equal`
 * rather than `+`, and why `serializeKeyEvent` below must reproduce that exact
 * normalization — a binding string rhk can't parse silently never fires.
 */

import { HOTKEYS } from '@/features/hotkeys/hotkeys';
import {
  HOTKEY_PRESETS,
  type HotkeyPresetId,
} from '@/features/hotkeys/presets';

/** Action id → the keys currently bound to it. */
export type EffectiveBindings = Readonly<Record<string, readonly string[]>>;

/** User rebindings, keyed by action id. Sparse — absent means "use the preset". */
export type HotkeyOverrides = Readonly<Record<string, readonly string[]>>;

/**
 * The catalog's own bindings — i.e. the Untap scheme, which every preset falls
 * back to for actions it doesn't mention.
 */
export function getCatalogBindings(): EffectiveBindings {
  const out: Record<string, readonly string[]> = {};
  for (const hotkey of HOTKEYS) out[hotkey.action] = hotkey.keys;
  return out;
}

/**
 * Resolve the full action → keys map for a preset plus the user's overrides.
 *
 * Precedence is override > preset > catalog. Every catalog action appears in the
 * result (possibly as an empty array), so callers can index without a fallback.
 */
export function resolveBindings(
  preset: HotkeyPresetId,
  overrides: HotkeyOverrides = {},
): EffectiveBindings {
  const presetBindings = HOTKEY_PRESETS[preset] ?? {};
  const out: Record<string, readonly string[]> = {};
  for (const hotkey of HOTKEYS) {
    out[hotkey.action] =
      overrides[hotkey.action] ?? presetBindings[hotkey.action] ?? hotkey.keys;
  }
  return out;
}

/** Keys bound to one action, or `[]` if it's unbound or unknown. */
export function getBinding(bindings: EffectiveBindings, action: string): readonly string[] {
  return bindings[action] ?? [];
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * How single rhk tokens render. Anything absent is upper-cased, which covers
 * every letter and digit.
 *
 * These glyphs are the ones the catalog used to carry by hand in its `key`
 * field — `'Back'` (with a `// leaving this icon here: ⌫` note), `'↑'`, `'Space'`.
 * That field is gone; this map is now the single place display is decided.
 */
const KEY_LABELS: Readonly<Record<string, string>> = {
  space: 'Space',
  backspace: 'Back',
  delete: 'Del',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  equal: '=',
  minus: '-',
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  slash: '/',
  semicolon: ';',
  quote: "'",
  comma: ',',
  period: '.',
  backquote: '`',
};

/**
 * Modifier glyphs. `meta` is platform-dependent, but every other surface in the
 * app hard-codes `⌘` alongside a `Ctrl` alternative rather than sniffing the
 * platform, so this stays symbol-only and simple.
 */
const MODIFIER_LABELS: Readonly<Record<string, string>> = {
  shift: '⇧',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: '⌥',
  meta: '⌘',
  mod: '⌘',
};

/** A shifted pair renders as the shifted character itself, not `⇧=`. */
const SHIFTED_LABELS: Readonly<Record<string, string>> = {
  equal: '+',
  minus: '_',
  comma: '<',
  period: '>',
  slash: '?',
  semicolon: ':',
  backquote: '~',
  quote: '"',
  bracketleft: '{',
  bracketright: '}',
  backslash: '|',
};

/** Render one binding string (e.g. `shift+equal`) for display. */
export function formatKey(binding: string): string {
  const parts = binding.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  const base = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // `shift+equal` is `+`, not `⇧=`. Only collapse when shift is the sole
  // modifier and the base has a known shifted form.
  if (modifiers.length === 1 && modifiers[0] === 'shift' && SHIFTED_LABELS[base]) {
    return SHIFTED_LABELS[base];
  }

  const label = KEY_LABELS[base] ?? base.toUpperCase();
  return [...modifiers.map((m) => MODIFIER_LABELS[m] ?? m), label].join('');
}

/**
 * Render a whole binding list. Multiple bindings join with the same doubled
 * spacing the catalog used to hard-code (`'+  or  ='`), so the Help table and
 * context-menu shortcut column look exactly as they did.
 */
export function formatKeyBinding(keys: readonly string[] | undefined): string {
  if (!keys || keys.length === 0) return '';
  return keys.map(formatKey).join('  or  ');
}

/**
 * The single character a "press X to confirm" prompt should show and accept.
 *
 * `ConfirmationDialog` matches on `event.key`, not `event.code`, and compares it
 * against the very string it renders — so it needs one character, not a chord.
 * Modifiers are dropped rather than rendered: showing "⇧L" would print a label
 * the dialog's own comparison could never match, so a mulligan bound to a chord
 * would become unconfirmable. Accepting the bare base key is forgiving and
 * always truthful.
 *
 * Returns `''` when the action is unbound, which callers should treat as "no
 * key prompt".
 */
export function getConfirmationKey(keys: readonly string[] | undefined): string {
  if (!keys || keys.length === 0) return '';
  const first = keys[0];
  const base = first.split('+').filter(Boolean).pop() ?? '';
  return formatKey(base);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/** Physical keys that only ever act as modifiers, so can't be bound alone. */
const BARE_MODIFIER_CODES = new Set([
  'shift', 'control', 'ctrl', 'alt', 'meta', 'os', 'capslock', 'fn',
]);

/**
 * rhk's alias table, applied to the *original-case* code before lowercasing.
 *
 * This is why it can't be folded into the regex below: `ShiftLeft` has to become
 * `shift` (a modifier we refuse to bind alone), but lowercasing first would
 * yield `shiftleft` and the lookup would miss. Copied from rhk v5 verbatim so
 * the two normalizations can't disagree.
 */
const CODE_ALIASES: Readonly<Record<string, string>> = {
  esc: 'escape',
  return: 'enter',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  MetaLeft: 'meta',
  MetaRight: 'meta',
  OSLeft: 'meta',
  OSRight: 'meta',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
};

/**
 * Normalize a `KeyboardEvent.code` the way react-hotkeys-hook does.
 *
 * Mirrors rhk v5's internal `mapKey`: alias lookup on the trimmed original, then
 * lowercase, then a deliberately un-anchored, non-global `replace` — so `KeyD` →
 * `d`, `Digit1` → `1`, `ShiftLeft` → `shift`.
 */
export function normalizeKeyCode(code: string): string {
  const trimmed = code.trim();
  return (CODE_ALIASES[trimmed] ?? trimmed).toLowerCase().replace(/key|digit|numpad/, '');
}

/**
 * Turn a keypress into a binding string, or `null` if it isn't bindable.
 *
 * Returns `null` for a bare modifier press so the capture UI can keep waiting
 * while the user holds ⇧ before hitting the real key.
 *
 * Modifier order is fixed (ctrl, alt, shift, meta) so the same chord always
 * serializes identically — rhk parses order-independently, but a stable string
 * keeps conflict detection and equality checks honest.
 */
export function serializeKeyEvent(event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const base = normalizeKeyCode(event.code);
  if (!base || BARE_MODIFIER_CODES.has(base)) return null;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');
  if (event.metaKey) modifiers.push('meta');

  return [...modifiers, base].join('+');
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/**
 * Actions that legitimately share a key.
 *
 * `delete` and `tokenDelete` have both been Backspace since before rebinding
 * existed: one is enabled only while a battlefield card is hovered, the other
 * only while a token is, and a single handler picks between them. Flagging that
 * as a conflict would be a false alarm on shipped behaviour.
 */
const SHARED_KEY_ACTIONS: ReadonlySet<string> = new Set(['delete', 'tokenDelete']);

/**
 * Other actions bound to `binding`, ignoring `action` itself.
 *
 * Deliberately ignores hover context: two actions with disjoint `enabled` sets
 * *can* share a key safely, but that's a runtime property of
 * `useAllGameHotkeys`, not something the catalog states. So this over-reports
 * rather than under-reports, and the UI warns instead of blocking.
 */
export function findConflicts(
  bindings: EffectiveBindings,
  action: string,
  binding: string,
): string[] {
  if (SHARED_KEY_ACTIONS.has(action)) return [];
  return Object.entries(bindings)
    .filter(([other, keys]) =>
      other !== action && !SHARED_KEY_ACTIONS.has(other) && keys.includes(binding))
    .map(([other]) => other);
}
