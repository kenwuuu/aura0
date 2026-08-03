/**
 * Hotkey presets — whole keyboard schemes a player can adopt in one click.
 *
 * ## Presets are diffs, not snapshots
 *
 * A preset lists only the actions whose keys it *changes* from the `HOTKEYS`
 * catalog. `untap` is therefore empty: the catalog has always been modelled on
 * Untap.in, so it already *is* that preset, and copying it here would create a
 * second definition to keep in sync. Resolution (see `bindings.ts`) falls
 * through to the catalog for anything a preset doesn't mention, which means a
 * new action added to the catalog is bound in every preset for free — no
 * per-preset upkeep and nothing to migrate.
 *
 * ## Each preset must be internally consistent
 *
 * These diffs are *cycles*, not independent edits. In `default`, `D` is only
 * free for Draw because Discard vacated it for `G`; drop that one line and `D`
 * is bound twice. `presets.test.ts` pins uniqueness across every resolved
 * preset for exactly this reason — it is not a style check.
 *
 * Keys are react-hotkeys-hook binding strings, which match on `event.code`
 * normalized as `code.toLowerCase().replace(/key|digit|numpad/, '')`. That's why
 * they read `equal`/`minus`/`bracketright` rather than `=`/`-`/`]`. See
 * `serializeKeyEvent` in `bindings.ts`.
 */

export const HotkeyPreset = {
  /** The catalog as-is: the scheme Aura shipped with, taken from Untap.in. */
  Untap: 'untap',
  /** Mnemonic keys — the action's own initial wherever one is free. */
  Default: 'default',
  /** Moxfield's playtester bindings. */
  Moxfield: 'moxfield',
} as const;

export type HotkeyPresetId = typeof HotkeyPreset[keyof typeof HotkeyPreset];

/** A preset's overrides: action id → react-hotkeys-hook binding strings. */
export type PresetBindings = Readonly<Record<string, readonly string[]>>;

/**
 * Untap.in — the catalog verbatim, so this is deliberately empty.
 *
 * Worth recording for whoever revisits this: Untap has **no** hotkey page on the
 * web. Its wiki's "Game Interface" book is empty; the only first-party source is
 * the in-game "Hotkey Help" overlay image, mirrored at
 * github.com/cokeeffekt/untap-wiki. The Cheatography sheet that every search
 * result echoes adds `Z`=Pivot and `I`=Invert, which appear on no official
 * image — don't "correct" the catalog from it.
 */
const UNTAP: PresetBindings = {};

/**
 * Mnemonic scheme: the action's own initial where one is free.
 *
 * Eight keys move from the catalog, and they move as one cycle — Draw takes `D`
 * only because Discard becomes `G` (what players call that zone anyway), and
 * Copy takes `C` only because Draw left it.
 *
 * Counters land on `]`/`[` because `U` is spent on Untap all, which is the
 * mnemonic that motivates the whole preset. They're the weakest pick here;
 * per-action rebinding exists precisely for keys like these.
 */
const DEFAULT: PresetBindings = {
  draw: ['d'],
  moveToDiscard: ['g'],
  moveToExile: ['e'],
  shuffle: ['s'],
  untapAll: ['u'],
  copy: ['c'],
  addCounter: ['bracketright'],
  removeCounter: ['bracketleft'],
};

/**
 * Moxfield's playtester bindings, transcribed from its official help page
 * (moxfield.com/help/help-articles/shortcuts, "Playtester Shortcuts").
 *
 * Three deliberate departures, all because Moxfield documents nothing usable:
 *
 * - **Life stays on `+`/`-`.** Moxfield lists "`Up` or `+`", but `↑`/`↓` are our
 *   keyword-token +1/−1. Taking its other documented alternate avoids a clash.
 * - **Moxfield's `B` is not mapped.** It means "move *selected* card(s) to the
 *   battlefield" — selection semantics we have no hotkey for. Our
 *   `playToBattlefield` is "top of your library", which Moxfield has no key for
 *   at all, so `P` stays and `B` remains Sideboard (also absent from Moxfield's
 *   playtester).
 * - **Counters get `]`/`[`.** Moxfield has no counter key; it's an open feature
 *   request (moxfield.nolt.io/1945).
 *
 * Its `V` (view library), `C` (command zone), `R` (restart), `N` (next turn),
 * `1`–`4` (dice) and `M` (mana tracker) map to nothing we bind a key to.
 */
const MOXFIELD: PresetBindings = {
  draw: ['d'],
  shuffle: ['s'],
  untapAll: ['u'],
  tap: ['t'],
  copy: ['x'],
  moveToDiscard: ['g'],
  moveToExile: ['e'],
  moveToDeckTop: ['l'],
  moveToDeckBottom: ['shift+l'],
  addCounter: ['bracketright'],
  removeCounter: ['bracketleft'],
};

export const HOTKEY_PRESETS: Readonly<Record<HotkeyPresetId, PresetBindings>> = {
  [HotkeyPreset.Untap]: UNTAP,
  [HotkeyPreset.Default]: DEFAULT,
  [HotkeyPreset.Moxfield]: MOXFIELD,
};

export const PRESET_LABELS: Readonly<Record<HotkeyPresetId, string>> = {
  [HotkeyPreset.Untap]: 'Untap',
  [HotkeyPreset.Default]: 'Default',
  [HotkeyPreset.Moxfield]: 'Moxfield',
};

/** One-line "what is this scheme" shown under the preset picker. */
export const PRESET_DESCRIPTIONS: Readonly<Record<HotkeyPresetId, string>> = {
  [HotkeyPreset.Untap]: "The keys Aura shipped with, matching Untap.in.",
  [HotkeyPreset.Default]: 'Mnemonic keys — D draws, U untaps, G sends to the graveyard.',
  [HotkeyPreset.Moxfield]: "Matches Moxfield's playtester where it defines a key.",
};

/** Display order for the preset picker. */
export const PRESET_ORDER: readonly HotkeyPresetId[] = [
  HotkeyPreset.Default,
  HotkeyPreset.Untap,
  HotkeyPreset.Moxfield,
];

export function isHotkeyPresetId(value: unknown): value is HotkeyPresetId {
  return typeof value === 'string' && value in HOTKEY_PRESETS;
}
