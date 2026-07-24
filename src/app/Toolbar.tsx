/**
 * Toolbar — the top menu bar.
 *
 * Composes deck import, secondary actions (⌘K palette/Help/Discord), connection
 * status, and the new-game/room-link buttons into one responsive row. Below
 * the `sm` breakpoint (640px — see `src/shared/hooks/breakpoints.ts`, which
 * mirrors Tailwind's default scale):
 *   - The ⌘K launcher disappears entirely (the palette is a keyboard feature,
 *     not useful without one) rather than moving into the overflow menu.
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
import { MoreHorizontal, Search } from 'lucide-react';
import { DeckManager } from '@/features/deck-manager';
import { RoomConnectionStatus } from '@/features/room/RoomConnectionStatus';
import { RoomLinkButton } from '@/features/room/RoomLinkButton';
import { NewGameButton } from '@/features/room/NewGameButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useOverlayStore } from '@/app/stores/overlayStore';
import type { SavedDeck } from '@/features/player/types';
import type { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';

const DISCORD_URL = 'https://discord.gg/PgH2gVZYKq';
const KOFI_URL = 'https://ko-fi.com/Z8Z11OOHFX';

interface ToolbarProps {
  yjsNetworkProvider: YjsNetworkProvider;
  onDeckSelected: (deck: SavedDeck) => void;
}

export function Toolbar({ yjsNetworkProvider, onDeckSelected }: ToolbarProps) {
  // The command palette and Help modal are mounted at the app shell (App.tsx);
  // the toolbar only flips their open flags in the shared overlay store, so
  // both these buttons and the palette's own commands drive the same instance.
  const openOverlay = useOverlayStore((s) => s.open);

  // Items that collapse into the "⋯ More" menu below `sm`. The ⌘K launcher isn't
  // here — see the file header for why it just disappears instead.
  const overflowActions = [
    { id: 'help', label: 'Help', onSelect: () => openOverlay('help') },
    { id: 'discord', label: 'Discord', onSelect: () => window.open(DISCORD_URL, '_blank') },
    { id: 'kofi', label: 'Support me on Ko-fi', onSelect: () => window.open(KOFI_URL, '_blank') },
  ];

  return (
    <div id="toolbar" data-testid="toolbar">
      <DeckManager onDeckSelected={onDeckSelected} />

      <button
        className="toolbar-button toolbar-hotkeys"
        data-testid="command-palette-open"
        onClick={() => openOverlay('commandPalette')}
        aria-label="Open command palette"
      >
        <Search size={14} style={{ verticalAlign: 'middle' }} /> ⌘K
      </button>

      <button className="toolbar-button toolbar-collapsible" onClick={() => openOverlay('help')}>
        Help
      </button>

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

      {/* modal={false}: the "Help" item flips the overlay store, which mounts a
          Radix Dialog (HelpModal, in App.tsx) on the next render — effectively
          "from onSelect". A modal DropdownMenu and a modal Dialog both lock
          document.body's pointer-events and restore it on unmount — if the
          Dialog mounts while the menu is still closing, it captures "none" as
          the value to restore, leaving the whole app unclickable after the
          Dialog closes. Non-modal avoids the overlap (same reasoning as
          GameActionsToolbar's Actions/Create dropdowns). */}
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
