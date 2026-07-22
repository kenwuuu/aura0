/**
 * Toolbar — the top menu bar.
 *
 * Composes deck import, secondary actions (Hotkeys/Help/Discord), connection
 * status, and the new-game/room-link buttons into one responsive row. Below
 * the `sm` breakpoint (640px — see `src/shared/hooks/breakpoints.ts`, which
 * mirrors Tailwind's default scale):
 *   - Hotkeys disappears entirely (it's a keyboard-shortcut reference, not
 *     useful without a keyboard) rather than moving into the overflow menu.
 *   - Help, Discord, and Ko-fi move into a "⋯ More" overflow menu.
 *   - The deck-import label shortens, the connection status collapses to a
 *     dot (see RoomConnectionStatus), and the new-game/copy-link buttons go
 *     icon-only (see NewGameButton/RoomLinkButton).
 * The CSS half of this lives in style.css under "Toolbar responsive
 * collapse".
 *
 * Deliberately CSS-first rather than driven by `useMediaQuery`: Tailwind's
 * own utilities live in `@layer utilities`, while the legacy `.toolbar-button`
 * styles below are unlayered global CSS. Per the CSS cascade-layers spec, an
 * unlayered rule always beats a layered one regardless of specificity or
 * source order — so a Tailwind `hidden`/`sm:` utility class placed on an
 * element that also carries `.toolbar-button` would silently lose to
 * `.toolbar-button`'s unlayered `display: flex`. Plain (also-unlayered)
 * media-query classes in style.css sidestep that entirely. `useMediaQuery`
 * remains the sanctioned primitive for the rest of the responsive project,
 * for cases that need a real JS branch rather than pure show/hide.
 */
import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { DeckManager } from '@/features/deck-manager';
import { HotkeysModal } from '@/features/hotkeys/HotkeysModal';
import { HelpModal } from '@/app/HelpModal';
import { RoomConnectionStatus } from '@/features/room/RoomConnectionStatus';
import { RoomLinkButton } from '@/features/room/RoomLinkButton';
import { NewGameButton } from '@/features/room/NewGameButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { BugReportButton, openBugReport } from '@/features/bug-report';
import { DISCORD_URL } from '@/constants';
import type { SavedDeck } from '@/features/player/types';
import type { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';

const KOFI_URL = 'https://ko-fi.com/Z8Z11OOHFX';

interface ToolbarProps {
  yjsNetworkProvider: YjsNetworkProvider;
  onDeckSelected: (deck: SavedDeck) => void;
}

export function Toolbar({ yjsNetworkProvider, onDeckSelected }: ToolbarProps) {
  const [isHotkeysOpen, setHotkeysOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);

  // Items that collapse into the "⋯ More" menu below `sm`. Hotkeys isn't
  // here — see the file header for why it just disappears instead.
  const overflowActions = [
    { id: 'help', label: 'Help', onSelect: () => setHelpOpen(true) },
    { id: 'bug-report', label: 'Report a bug', onSelect: () => void openBugReport('toolbar') },
    { id: 'discord', label: 'Discord', onSelect: () => window.open(DISCORD_URL, '_blank') },
    { id: 'kofi', label: 'Support me on Ko-fi', onSelect: () => window.open(KOFI_URL, '_blank') },
  ];

  return (
    <div id="toolbar" data-testid="toolbar">
      <DeckManager onDeckSelected={onDeckSelected} />

      <button className="toolbar-button toolbar-hotkeys" onClick={() => setHotkeysOpen(true)}>
        Hotkeys
      </button>
      <HotkeysModal isOpen={isHotkeysOpen} onClose={() => setHotkeysOpen(false)} />

      <button className="toolbar-button toolbar-collapsible" onClick={() => setHelpOpen(true)}>
        Help
      </button>
      <HelpModal isOpen={isHelpOpen} onClose={() => setHelpOpen(false)} />

      {/* Icon-only, like Discord below it: the toolbar is already tight at the
          `sm` breakpoint, and this is a rarely-clicked escape hatch rather than
          a primary action. It still collapses into "⋯ More" on phones. */}
      <BugReportButton surface="toolbar" iconOnly className="toolbar-button toolbar-collapsible" />

      <button
        className="toolbar-button discord toolbar-collapsible"
        onClick={() => window.open(DISCORD_URL, '_blank')}
        aria-label="Join Discord Server"
      >
        <img src="/assets/Discord-Logo-White.svg" alt="Discord" style={{ height: '16px' }} />
      </button>

      <a
        className="toolbar-button toolbar-kofi toolbar-collapsible"
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Support me on Ko-fi"
        aria-label="Support me on Ko-fi"
      >
        Ko-fi
      </a>

      <span id="connection-status" data-testid="connection-status">
        <RoomConnectionStatus yjsNetworkProvider={yjsNetworkProvider} />
      </span>

      <NewGameButton />
      <RoomLinkButton />

      {/* modal={false}: the "Help" item opens a Radix Dialog from onSelect.
          A modal DropdownMenu and a modal Dialog both lock document.body's
          pointer-events and restore it on unmount — if the Dialog mounts
          while the menu is still closing, it captures "none" as the value to
          restore, leaving the whole app unclickable after the Dialog closes.
          Non-modal avoids the overlap (same reasoning as GameActionsToolbar's
          Actions/Create dropdowns). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className="toolbar-button toolbar-more-trigger"
            data-testid="toolbar-more"
            aria-label="More toolbar options"
          >
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {overflowActions.map((action) => (
            <DropdownMenuItem key={action.id} onSelect={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
