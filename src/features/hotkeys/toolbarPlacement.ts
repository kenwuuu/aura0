/**
 * Running a catalog action from a surface that has **no hover**.
 *
 * The keyboard and the right-click menus both read their target off whatever is
 * under the cursor. The game-actions toolbar and the ⌘K palette have nothing
 * under the cursor at all, so each catalog entry declares the target its row
 * means (`ToolbarPlacement`, added in #198) and this module resolves it.
 *
 * Its own file rather than part of `gameActions` for two reasons: that file owns
 * the executors and this owns a surface concern, and — practically — a caller
 * mocking `dispatchGameAction` to assert what a row dispatches needs this to sit
 * on the other side of that boundary. Inside `gameActions` it would call the
 * module-internal function and the assertion would see nothing.
 */
import { dispatchGameAction } from './gameActions';
import type { MenuTarget, ToolbarHotkey, ToolbarPlacement } from './hotkeys';

/**
 * The `MenuTarget` a placement means.
 *
 * A screen-centre point stands in for the board cursor; every board action
 * offered on a hoverless surface ignores it (only the counter spawns use it, and
 * they're on neither).
 */
export function targetForPlacement(placement: ToolbarPlacement): MenuTarget {
  if (placement.target === 'deck') return { kind: 'pile', pileType: 'deck' };
  return {
    kind: 'board',
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  };
}

/**
 * Run a catalog entry from a hoverless surface. Shared by the toolbar and the
 * palette so a row cannot mean one thing in one and something else in the other.
 */
export function dispatchPlacedAction(hotkey: ToolbarHotkey): void {
  if (hotkey.disabled) return;
  dispatchGameAction(hotkey.action, targetForPlacement(hotkey.toolbar));
}
