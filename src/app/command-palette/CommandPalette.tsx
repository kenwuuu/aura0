/**
 * ⌘K command palette — a searchable launcher for target-free game actions and
 * app navigation, a searchable index of the Help guide, plus a read-only
 * reference for the target-bound keyboard shortcuts (Tap, Flip, the move
 * family, …) that need a hovered card.
 *
 * Mounted once at the app shell (a sibling of `GameHotkeysManager`, i.e. outside
 * its `HotkeysProvider`), so its `mod+k` binding is scope-less and always live.
 * Open state lives in `overlayStore` so the toolbar launcher and the palette's
 * own "Open Help" / "Import a deck" commands share it.
 *
 * Scoring is `paletteFilter`, not cmdk's default — it adds a relevance floor,
 * because a fuzzy matcher makes almost every short query match almost every row
 * a little. See that file for the measurements.
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
import { useEffectiveBindings } from '@/features/hotkeys/useHotkeyBindings';
import { formatKeyBinding, getBinding } from '@/features/hotkeys/bindings';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { HELP_SECTIONS } from '@/app/content/help/sections';
import { getCommands, RUNNABLE_ACTION_IDS, type AppCommand } from './commands';
import { helpRowValue, paletteFilter } from './paletteFilter';

/**
 * The Help guide, one row per section, opening Help at that section.
 *
 * Rendered unconditionally, and **not** gated on a non-empty search. Gating it
 * looked tidier — it keeps 25 doc rows out of the palette's resting state — but
 * mounting a whole group mid-keystroke loses the race with cmdk's item
 * registration: on the first query typed after opening, the rows appeared and
 * nothing was selected at all, so Enter did nothing. Rendering the group up
 * front costs a longer list on open and gets a palette that always has a
 * selection.
 *
 * Placed after the runnable groups on purpose — see `paletteFilter`, where
 * source order (not a score bias) is what stops a doc outranking the action it
 * documents.
 *
 * Matches on the breadcrumb and the section's curated keywords only, never body
 * text: in the old single-file help, "draw" hit two sections and one of them
 * matched purely on the word "draw**n**" in a sentence about import order.
 */
function HelpSectionRows() {
  return (
    <CommandGroup heading="Help">
      {HELP_SECTIONS.map((section) => (
        <CommandItem
          key={section.id}
          value={helpRowValue(section.group, section.title)}
          keywords={[...section.keywords]}
          onSelect={() => {
            const overlay = useOverlayStore.getState();
            overlay.close('commandPalette');
            overlay.openHelp({ tab: 'guide', section: section.id });
          }}
        >
          <span>
            <span className="text-muted-foreground">{section.group} › </span>
            {section.title}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

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

  // Both the runnable commands' key badges and the reference rows below read the
  // player's effective bindings, so the palette never advertises a stale key.
  const bindings = useEffectiveBindings();
  const commands = getCommands(bindings);
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
      filter={paletteFilter}
    >
      <CommandInput placeholder="Search actions, shortcuts and help…" />
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

        <HelpSectionRows />

        {referenceZones.length > 0 && <CommandSeparator />}

        {/* Shortcut reference — these actions need a hovered target, so the
            palette can't run them. Selecting one opens Help on its Shortcuts
            tab: the majority of the palette's rows are these, and they used to
            be dead ends (`onSelect={() => {}}`), which read as the palette
            being broken. */}
        {referenceZones.map((z) => (
          <CommandGroup key={z.zone} heading={`${z.zone} shortcuts`}>
            {z.hotkeys.map((h) => {
              const shortcut = formatKeyBinding(getBinding(bindings, h.action));
              return (
                <CommandItem
                  key={h.action}
                  value={h.longDescription}
                  // The key text stays searchable, so typing the letter you press
                  // finds the action — which only works if it's the letter *this*
                  // player presses.
                  keywords={[shortcut, h.action]}
                  onSelect={showShortcutReference}
                >
                  <span>{h.longDescription}</span>
                  <CommandShortcut>{shortcut}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
