/**
 * ⌘K command palette — a searchable launcher for target-free game actions and
 * app navigation, plus a read-only reference for the target-bound keyboard
 * shortcuts (Tap, Flip, the move family, …) that need a hovered card.
 *
 * Mounted once at the app shell (a sibling of `GameHotkeysManager`, i.e. outside
 * its `HotkeysProvider`), so its `mod+k` binding is scope-less and always live.
 * Open state lives in `overlayStore` so the toolbar launcher and the palette's
 * own "Open Help" / "Import a deck" commands share it.
 */
import { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/ui/command';
import { getHotkeysGroupedByZone } from '@/features/hotkeys/hotkeys';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { getCommands, RUNNABLE_ACTION_IDS, type AppCommand } from './commands';

export function CommandPalette() {
  const open = useOverlayStore((s) => s.commandPaletteOpen);
  const setModalOpen = useHotkeyStore((s) => s.setModalOpen);

  // ⌘K / Ctrl+K toggles the palette from anywhere. No `scopes` → always active,
  // regardless of the Board/PileViewer scope switch; `enableOnFormTags` lets it
  // fire (and re-close) even while a text field — including cmdk's own input —
  // has focus. It won't collide with the plain `k` (clone) binding.
  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault();
      useOverlayStore.getState().toggle('commandPalette');
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  // Belt-and-suspenders for suppressing single-key board hotkeys while the
  // palette is open — the same `setModalOpen` switch the AddCard modal and pile
  // viewer use (cmdk's focused input already swallows typing; this covers the
  // input-blurred edge). Palette and pile viewer aren't open at the same time.
  useEffect(() => {
    setModalOpen(open);
  }, [open, setModalOpen]);

  const commands = getCommands();
  const game = commands.filter((c) => c.section === 'Game');
  const players = commands.filter((c) => c.section === 'Players');
  const nav = commands.filter((c) => c.section === 'Navigation');

  // Reference = the keyboard-bound actions that AREN'T runnable here (they need
  // a hovered target), so nothing shows up twice.
  const referenceZones = getHotkeysGroupedByZone()
    .map((z) => ({
      zone: z.zone,
      hotkeys: z.hotkeys.filter((h) => !RUNNABLE_ACTION_IDS.has(h.action)),
    }))
    .filter((z) => z.hotkeys.length > 0);

  const run = (cmd: AppCommand) => {
    useOverlayStore.getState().close('commandPalette');
    cmd.run();
  };

  // Reference rows can't be run from here, so selecting one hands the player
  // off to the full cheat-sheet instead of doing nothing.
  const showShortcutReference = () => {
    const overlay = useOverlayStore.getState();
    overlay.close('commandPalette');
    overlay.openHelp({ tab: 'shortcuts' });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => useOverlayStore.getState().set('commandPalette', o)}
      title="Command palette"
      description="Search for an action to run or a shortcut to look up."
      // No × button: the shared DialogContent close uses the pile-viewer's
      // 36px glyph, which is oversized for a spotlight. Palettes close on
      // Escape / click-outside, matching Raycast/Obsidian/Cloudflare.
      showCloseButton={false}
    >
      <CommandInput placeholder="Search actions and shortcuts…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Game">
          {game.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={cmd.label}
              keywords={cmd.keywords}
              onSelect={() => run(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Only rendered when someone has actually left the room. */}
        {players.length > 0 && (
          <CommandGroup heading="Players">
            {players.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={cmd.label}
                keywords={cmd.keywords}
                onSelect={() => run(cmd)}
              >
                <span>{cmd.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Navigation">
          {nav.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={cmd.label}
              keywords={cmd.keywords}
              onSelect={() => run(cmd)}
            >
              <span>{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {referenceZones.length > 0 && <CommandSeparator />}

        {/* Shortcut reference — these actions need a hovered target, so the
            palette can't run them. Selecting one opens Help on its Shortcuts
            tab: the majority of the palette's rows are these, and they used to
            be dead ends (`onSelect={() => {}}`), which read as the palette
            being broken. */}
        {referenceZones.map((z) => (
          <CommandGroup key={z.zone} heading={`${z.zone} shortcuts`}>
            {z.hotkeys.map((h) => (
              <CommandItem
                key={h.action}
                value={h.longDescription}
                keywords={[h.key, h.action]}
                onSelect={showShortcutReference}
              >
                <span>{h.longDescription}</span>
                <CommandShortcut>{h.key}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
