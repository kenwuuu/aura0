/**
 * GameContextMenu
 *
 * Single app-level right-click menu for every game item (battlefield cards,
 * hand cards, piles, tokens, the local player's health, the empty board, and
 * pile-viewer cards) — replaces the old `HotkeyMenu`. Rows are derived from
 * `getMenuActionsForTarget(target)` (the same `HOTKEYS` catalog the keyboard
 * hotkeys read), and clicking a row dispatches through `dispatchGameAction`,
 * the same entry point the keyboard uses — menu and hotkeys can never drift.
 *
 * Built on the shadcn `DropdownMenu` (`@/shared/ui/dropdown-menu`) rather
 * than the raw Popover the old menu used, for free keyboard nav/ARIA and a
 * Tailwind-themed surface that's easy to restyle wholesale later. Radix's
 * DropdownMenu has no `Anchor` primitive (unlike Popover), so cursor
 * positioning uses the same trick with `Trigger`: a zero-size element pinned
 * at (x, y), with `Content` positioned relative to it via Radix Popper.
 */

import { useContextMenuStore } from './contextMenuStore';
import { getMenuActionsForTarget } from './hotkeys';
import { dispatchGameAction } from './gameActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { CreateTokenGridItem } from '@/features/game-actions/CreateTokenGridItem';

export function GameContextMenu() {
  const isOpen = useContextMenuStore((s) => s.isOpen);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const target = useContextMenuStore((s) => s.target);
  const viaTouch = useContextMenuStore((s) => s.viaTouch);
  const anchorRect = useContextMenuStore((s) => s.anchorRect);
  const close = useContextMenuStore((s) => s.close);

  // `touchMenuOnly` rows (a token's +1/-1) only belong in the menu on touch,
  // where there's no hover-and-click affordance — desktop right-click hides
  // them. See the `touchMenuOnly` doc on the Hotkey type.
  const rows = (target ? getMenuActionsForTarget(target) : [])
    .filter((row) => viaTouch || !row.touchMenuOnly);
  const open = isOpen && rows.length > 0;

  // The hand is anchored to the bottom of the screen (both desktop and phone),
  // so a hand-card menu anchored at the tap/cursor point with the default
  // side="right" would collision-flip upward and cover the hand. Open it
  // upward and centered so it sits over the board above the hand instead.
  const isHandCard = target?.kind === 'handCard';

  return (
    // modal={false}: Radix's DropdownMenu defaults to modal (unlike Popover,
    // which the old menu used), which disables pointer events on the rest of
    // the page while open — including the card/pile/token just right-clicked.
    // That flips its hover state off from under it (a DOM reflow the browser
    // treats as the cursor "leaving"), clearing hoverTarget and breaking the
    // keyboard hotkeys that read it — hover a card, right-click it, then
    // press a hotkey key must still act on that card while the menu is open.
    // key on the cursor point: once Radix has positioned an open menu against
    // the fixed trigger span, moving that span (a second right-click elsewhere
    // while the menu is still open) doesn't re-anchor it — Popper only recomputes
    // on scroll/resize, not a style change. Remounting on a new point forces a
    // fresh position, so the menu follows the cursor instead of reopening at the
    // first spot.
    <DropdownMenu key={`${x},${y}`} open={open} onOpenChange={(next) => !next && close()} modal={false}>
      {/* Radix's DropdownMenu has no `Anchor` primitive, so the Trigger doubles
          as one. For a mouse right-click it's a zero-size point at the cursor.
          For a tap it's the tapped item's own box (`anchorRect`), so Popper
          places the menu *beside* the item instead of under the finger that is
          currently covering it. */}
      <DropdownMenuTrigger asChild>
        <span
          style={
            anchorRect
              ? {
                  position: 'fixed',
                  left: anchorRect.x,
                  top: anchorRect.y,
                  width: anchorRect.width,
                  height: anchorRect.height,
                  pointerEvents: 'none',
                }
              : { position: 'fixed', left: x, top: y, width: 0, height: 0 }
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isHandCard ? 'top' : 'right'}
        align={isHandCard ? 'center' : 'start'}
        sideOffset={2}
        collisionPadding={8}
        data-game-context-menu
        // The pile-viewer Dialog renders at z-[10000] (dialog.tsx); the menu
        // must win when both are open (a pile-viewer card's right-click menu)
        // or its rows render underneath the dialog and swallow clicks. The
        // shadcn default is only z-50. `pointer-events-auto` is required too:
        // the (still fully modal) Dialog sets `body.style.pointerEvents =
        // 'none'` while open, and since this menu is `modal={false}` (see
        // below) it never opts back into the "active layer" pointer-events
        // re-enable Radix normally does for a modal layer — without the
        // override, `pointer-events: none` simply inherits from body and the
        // menu becomes unclickable whenever it opens over an open dialog.
        className="z-[10001] pointer-events-auto"
        // This menu opens on right-click, not by tabbing to a trigger — it
        // must never grab focus. Two reasons: (1) selecting a row must not
        // shift DOM focus off whatever was focused behind it (e.g. a card in
        // an open PileViewer Dialog), or Radix's focus trap "steals" focus
        // back mid-click and the click never lands; (2) auto-focusing the
        // first item hands keydown to Radix's roving-focus/typeahead
        // handling, which swallows the same letter keys the keyboard hotkeys
        // use (e.g. 's' for exile) — hovering a card, right-clicking it, and
        // then pressing a hotkey must keep working exactly as if the menu
        // never opened.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        // The pile-viewer Dialog is modal, so its Radix FocusScope is
        // `trapped` — it keeps yanking focus back inside the Dialog. Each
        // forced refocus fires a `focusin` on a Dialog element, which is
        // "outside" this portaled, non-modal menu; DismissableLayer treats
        // that as a focus-outside interaction and dismisses. On a real cursor
        // path from the right-clicked card toward a menu row, this focus churn
        // fires within the first hop or two and the menu vanishes before the
        // pointer ever reaches it (a teleporting `.click()` skips the churn,
        // which is why the bug hid from the old coverage). This menu is
        // cursor-anchored, not focus-driven, so it should only dismiss on a
        // real outside pointer-down or Escape — never on focus movement.
        onFocusOutside={(e) => e.preventDefault()}
      >
        {target && rows.map((hotkey, index) => (
          <DropdownMenuItem
            key={`${hotkey.action}-${index}`}
            variant={hotkey.destructive ? 'destructive' : 'default'}
            onSelect={() => dispatchGameAction(hotkey.action, target)}
          >
            {hotkey.shortDescription}
            <DropdownMenuShortcut>{hotkey.key}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        {/* The empty-board menu offers token creation via the same drag-to-board
            grid as the toolbar's Create ▾ menu (it took the "-1/-1 counter"
            slot). It performs no dispatchable action, so it lives here rather
            than in the HOTKEYS catalog and carries no keyboard shortcut. */}
        {target?.kind === 'board' && (
          <CreateTokenGridItem
            label="Create token"
            columns={7}
            // Bottom-align the grid with this (last) item so its bottom edge
            // lines up with the long menu's bottom edge, and lift it to the
            // menu's own z-index so it isn't layered behind it.
            align="end"
            contentClassName="z-[10001]"
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
