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

export function GameContextMenu() {
  const isOpen = useContextMenuStore((s) => s.isOpen);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const target = useContextMenuStore((s) => s.target);
  const close = useContextMenuStore((s) => s.close);

  const rows = target ? getMenuActionsForTarget(target) : [];
  const open = isOpen && rows.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={(next) => !next && close()}>
      <DropdownMenuTrigger asChild>
        <span style={{ position: 'fixed', left: x, top: y, width: 0, height: 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        data-game-context-menu
        // Selecting a row must not shift DOM focus off whatever was focused
        // behind it (e.g. a card in an open PileViewer Dialog) — otherwise
        // Radix's focus trap "steals" focus back mid-click and the click
        // that would've landed on this row never fires. (Unlike Popover,
        // DropdownMenu.Content doesn't expose `onOpenAutoFocus` — it doesn't
        // trap focus by default, so this and the outside-click allowance in
        // PileViewerReact are enough.)
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
