/**
 * GameActionsToolbar
 *
 * Row of buttons for whole-game actions. On desktop it lives in a draggable
 * FloatingPanel (GameActionsToolbar); the buttons themselves are exported
 * separately as GameActionsContent so the phone HUD stack can host them too.
 *
 * Its rows come from the one game-action catalog — `HOTKEYS`, the same table the
 * keyboard and the right-click menus read — via `getToolbarActions(surface)`,
 * and clicks go through `dispatchGameAction`, the same entry point those two
 * surfaces use. So the toolbar cannot drift from them: it is a third *view* of
 * the catalog, not a second copy of it. (It used to be exactly that second copy,
 * with its own `perform()` bodies; the toolbar's Mulligan skipped the
 * confirmation the M key showed, and it carried private re-implementations of
 * rows the deck node already had.) Three surfaces render here:
 *   - 'button': plain buttons (Untap All, Draw, Pass)
 *   - 'actions': items in an "Actions ▾" dropdown
 *   - 'create': items in a "Create ▾" dropdown
 *
 * The Counter create item gets special treatment: it renders as a
 * `CreateTokenGridItem`, which opens a sub-popover hosting the KeywordTokenGrid
 * (drag-to-board ability tokens) — the same item the empty-board context menu
 * reuses. Its catalog entry dispatches nothing.
 */

import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  getToolbarActions,
  type MenuTarget,
  type ToolbarHotkey,
  type ToolbarPlacement,
} from '@/features/hotkeys/hotkeys';
import { dispatchGameAction } from '@/features/hotkeys/gameActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { FloatingPanel } from '@/shared/ui/FloatingPanel';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { CreateTokenGridItem } from './CreateTokenGridItem';

// ── Toolbar button style ─────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  transition: 'background 0.1s',
};

const btnHoverStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
};

/**
 * A non-modal DropdownMenu double-toggles when reopened by clicking its trigger
 * right after selecting an item: Radix opens the menu on the trigger's
 * pointerdown, then the freshly-mounted dismiss layer treats that *same*
 * pointerdown as an outside interaction and closes it again — so the menu never
 * reopens on the first click (a real papercut: after e.g. Exile Top, clicking
 * "Actions" again does nothing). Radix already exempts the trigger for a fresh
 * open; the post-select timing is where that slips through. Feed each menu's
 * `onInteractOutside` through this so a pointer/focus interaction on its own
 * trigger is treated as inside and the reopen sticks. Clicks truly outside
 * still dismiss, and clicking the trigger while open still toggles it closed.
 */
function keepTriggerInteractionsInside(triggerRef: React.RefObject<HTMLElement | null>) {
  return (event: { detail: { originalEvent: Event }; preventDefault: () => void }) => {
    const target = event.detail?.originalEvent?.target;
    if (target instanceof Node && triggerRef.current?.contains(target)) {
      event.preventDefault();
    }
  };
}

function ToolbarButton({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={hovered ? { ...btnStyle, ...btnHoverStyle } : btnStyle}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
    </button>
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * The target a toolbar click dispatches against. The toolbar has no hover, so
 * unlike the keyboard and the context menus it can't read one off the cursor —
 * each catalog entry declares the target its row means (see `ToolbarPlacement`).
 * A screen-centre point stands in for the board cursor; every board action the
 * toolbar offers ignores it (only the counter spawns use it, and they aren't
 * on the toolbar).
 */
function targetFor(placement: ToolbarPlacement): MenuTarget {
  if (placement.target === 'deck') return { kind: 'pile', pileType: 'deck' };
  return {
    kind: 'board',
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  };
}

function performAction(hotkey: ToolbarHotkey): void {
  if (hotkey.disabled) return;
  dispatchGameAction(hotkey.action, targetFor(hotkey.toolbar));
}

/** Toolbar label: `shortDescription` unless the row needs a targetless name. */
const labelOf = (hotkey: ToolbarHotkey) => hotkey.toolbar.label ?? hotkey.shortDescription;

/**
 * Rows that open a new group in the Actions ▾ menu. Grouping is presentation, so
 * it lives with the presentation: deck manipulation, then hand, then the
 * deck-wide reset.
 */
const ACTIONS_GROUP_STARTS = new Set(['randomDiscard', 'shuffle', 'resetDeck']);

function DisabledReason({ hotkey }: { hotkey: ToolbarHotkey }) {
  if (!hotkey.disabled || !hotkey.disabledReason) return null;
  return (
    <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
      {hotkey.disabledReason}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * The action buttons themselves (plain buttons + Actions/Create dropdowns).
 * Host-agnostic: the desktop FloatingPanel and the phone HUD stack both
 * render it. Renders nothing until the game instance is wired. `style` is
 * merged over the base row layout (the phone host adds wrapping + a width
 * cap).
 */
export function GameActionsContent({ style }: { style?: React.CSSProperties } = {}) {
  // The executors read player/yDoc/playerId from the store themselves, so this
  // only needs to know whether they're wired yet.
  const ready = useGameInstance((s) => Boolean(s.player && s.yDoc && s.playerId));

  // See keepTriggerInteractionsInside: needed so these non-modal menus reopen on
  // the first trigger click after an item was selected.
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement>(null);

  if (!ready) return null;

  const buttons = getToolbarActions('button');
  const actionsDropdown = getToolbarActions('actions');
  const createDropdown = getToolbarActions('create');

  return (
      <div
        data-testid="game-actions-toolbar"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', ...style }}
      >
      {/* Toolbar buttons */}
      {buttons.map((hotkey) => (
        <ToolbarButton
          key={hotkey.action}
          label={labelOf(hotkey)}
          title={hotkey.longDescription}
          onClick={() => performAction(hotkey)}
        />
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />

      {/* Actions dropdown */}
      {/* modal={false}: several items open a Radix Dialog (NumberPrompt,
          TokenCardSearchModal) from onSelect. A modal DropdownMenu and a modal
          Dialog both lock document.body's pointer-events and restore it on
          unmount — if the Dialog mounts while the menu is still closing, it
          captures "none" as the value to restore, leaving the whole app
          unclickable after the Dialog closes. Non-modal avoids the overlap. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button ref={actionsTriggerRef} style={btnStyle} title="Game actions">
            Actions <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" onInteractOutside={keepTriggerInteractionsInside(actionsTriggerRef)}>
          {actionsDropdown.map((hotkey, i) => (
            <React.Fragment key={hotkey.action}>
              {i > 0 && ACTIONS_GROUP_STARTS.has(hotkey.action) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                // `destructive` is a catalog property, so it has to mean the
                // same thing on every surface that renders the catalog — the
                // context menu already styles its rows this way.
                variant={hotkey.destructive ? 'destructive' : 'default'}
                disabled={hotkey.disabled}
                onSelect={() => performAction(hotkey)}
              >
                {labelOf(hotkey)}
                <DisabledReason hotkey={hotkey} />
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create dropdown */}
      {/* modal={false}: "Token Card" opens a Dialog from onSelect — see the
          Actions dropdown comment above for why this must be non-modal. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button ref={createTriggerRef} style={btnStyle} title="Create objects">
            Create <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" onInteractOutside={keepTriggerInteractionsInside(createTriggerRef)}>
          {createDropdown.map((hotkey) => {
            // Hosts the drag-to-board keyword grid instead of dispatching; its
            // catalog entry is a deliberate no-op executor.
            if (hotkey.action === 'createToken') {
              return <CreateTokenGridItem key={hotkey.action} columns={7} />;
            }
            return (
              <DropdownMenuItem
                key={hotkey.action}
                variant={hotkey.destructive ? 'destructive' : 'default'}
                disabled={hotkey.disabled}
                onSelect={() => performAction(hotkey)}
              >
                {labelOf(hotkey)}
                <DisabledReason hotkey={hotkey} />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
  );
}

export function GameActionsToolbar() {
  // Same readiness condition as GameActionsContent — don't render an empty
  // window frame before the game instance is wired.
  const ready = useGameInstance((s) => Boolean(s.player && s.yDoc && s.playerId));
  if (!ready) return null;

  return (
    // Default position matches the toolbar's old fixed spot (8px margin + 280px
    // action-log panel + 8px gap); it's now draggable and its position persists.
    <FloatingPanel persistKey="game-actions-toolbar" defaultPosition={{ x: 296, y: 60 }} title="Game Actions">
      <GameActionsContent />
    </FloatingPanel>
  );
}
