/**
 * GameActionsToolbar
 *
 * Row of buttons for whole-game actions. On desktop it lives in a draggable
 * FloatingPanel (GameActionsToolbar); the buttons themselves are exported
 * separately as GameActionsContent so the phone HUD stack can host them too.
 * Renders three kinds of surfaces from the GAME_ACTIONS registry:
 *   - 'toolbar': plain buttons (Untap All, Draw, Pass)
 *   - 'actions': items in an "Actions ▾" dropdown
 *   - 'create': items in a "Create ▾" dropdown
 *
 * The Token create item gets special treatment: clicking it opens a
 * sub-popover hosting the KeywordTokenGrid (drag-to-board ability tokens).
 *
 * All game state access goes through useGameInstance; actions call into the
 * registry's perform(ctx) — this component stays generic.
 */

import React, { useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { ChevronDown } from 'lucide-react';
import { GAME_ACTIONS } from './gameActions';
import type { GameActionContext } from './gameActionTypes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/ui/popover';
import { FloatingPanel } from '@/shared/ui/FloatingPanel';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import { KeywordTokenGrid } from '@/features/keyword-tokens/KeywordTokenGrid';
import { DEFAULT_TOKEN_TEMPLATES } from './defaultTokenTemplates';

// ── Toolbar button style ─────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  transition: 'background 0.1s',
};

const btnHoverStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
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

// ── Main component ───────────────────────────────────────────────────────────

/**
 * The action buttons themselves (plain buttons + Actions/Create dropdowns).
 * Host-agnostic: the desktop FloatingPanel and the phone HUD stack both
 * render it. Renders nothing until the game instance is wired. `style` is
 * merged over the base row layout (the phone host adds wrapping + a width
 * cap).
 */
export function GameActionsContent({ style }: { style?: React.CSSProperties } = {}) {
  const player = useGameInstance((s) => s.player);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);

  // See keepTriggerInteractionsInside: needed so these non-modal menus reopen on
  // the first trigger click after an item was selected.
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement>(null);

  const ctx = useMemo<GameActionContext | null>(() => {
    if (!player || !yDoc || !playerId) return null;
    return {
      player,
      yDoc,
      playerId,
      yCards: yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD),
      yTokens: yDoc.getMap(YDOC_KEYWORD_TOKENS),
    };
  }, [player, yDoc, playerId]);

  if (!ctx) return null;

  const toolbarActions = GAME_ACTIONS.filter((a) => a.surface === 'toolbar');
  const actionsDropdown = GAME_ACTIONS.filter((a) => a.surface === 'actions');
  const createDropdown = GAME_ACTIONS.filter((a) => a.surface === 'create');

  const performAction = (actionId: string) => {
    const action = GAME_ACTIONS.find((a) => a.id === actionId);
    if (!action || action.disabled) return;
    action.perform(ctx);
  };

  return (
      <div
        data-testid="game-actions-toolbar"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', ...style }}
      >
      {/* Toolbar buttons */}
      {toolbarActions.map((action) => (
        <ToolbarButton
          key={action.id}
          label={action.label}
          onClick={() => performAction(action.id)}
        />
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'var(--line-2)' }} />

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
          {actionsDropdown.map((action, i) => {
            const prev = actionsDropdown[i - 1];
            // Visual separator between certain groups
            const addSep =
              i > 0 &&
              ((action.id === 'reveal-hand' && prev.id !== 'reveal-hand') ||
               (action.id === 'shuffle' && prev.id !== 'shuffle') ||
               (action.id === 'reset-deck' && prev.id !== 'reset-deck'));
            return (
              <React.Fragment key={action.id}>
                {addSep && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={action.disabled}
                  onSelect={() => performAction(action.id)}
                >
                  {action.label}
                  {action.disabled && action.disabledReason && (
                    <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
                      {action.disabledReason}
                    </span>
                  )}
                </DropdownMenuItem>
              </React.Fragment>
            );
          })}
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
          {createDropdown.map((action) => {
            if (action.id === 'create-token') {
              return <TokenSubItem key={action.id} />;
            }
            return (
              <DropdownMenuItem
                key={action.id}
                disabled={action.disabled}
                onSelect={() => performAction(action.id)}
              >
                {action.label}
                {action.disabled && action.disabledReason && (
                  <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
                    {action.disabledReason}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
  );
}

export function GameActionsToolbar() {
  // Same readiness condition as GameActionsContent's ctx guard — don't render
  // an empty window frame before the game instance is wired.
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

// ── Token sub-item ───────────────────────────────────────────────────────────
// The "Token" create item opens a popover containing the ability/keyword
// token grid instead of navigating somewhere — the grid is drag-to-board.

function TokenSubItem() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PopoverAnchor, not PopoverTrigger: we already control `open` explicitly
          via onSelect below. A Trigger would compose its own click->onOpenChange
          handler onto this same DropdownMenuItem, double-toggling `open` (once
          from our onSelect, once from the Trigger's own click handling) and
          netting out to "never opens." Anchor only supplies position, no
          click behavior of its own. */}
      <PopoverAnchor asChild>
        <DropdownMenuItem
          onSelect={(e) => {
            // Prevent the dropdown from closing when the popover opens.
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          Token
          <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.6, transform: open ? 'rotate(180deg)' : undefined }} />
        </DropdownMenuItem>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        className="p-2 w-auto"
        style={{ background: 'rgba(13, 13, 20, 0.98)', border: '1px solid var(--line-2)' }}
        // The popover's anchor IS a DropdownMenuItem. Radix Menu focuses the
        // item on pointermove; if the popover has grabbed focus on open, that
        // focus-steal reads as "focus left the popover" and the non-modal
        // DismissableLayer dismisses it the instant the user's mouse crosses
        // the item on its way to the grid — the grid vanishes before it can be
        // used. Never take focus on open, and don't treat focus leaving as a
        // dismiss. Outside *clicks* and Escape still close it (pointer/escape
        // paths are untouched).
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 6, paddingLeft: 4 }}>
          Drag a token onto the board
        </p>
        <KeywordTokenGrid templates={DEFAULT_TOKEN_TEMPLATES} columns={5} gap={8} />
      </PopoverContent>
    </Popover>
  );
}
