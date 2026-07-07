/**
 * GameActionsToolbar
 *
 * Fixed-position row of buttons rendered to the right of the ActionLogPanel.
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

export function GameActionsToolbar() {
  const player = useGameInstance((s) => s.player);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);

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
      style={{
        position: 'fixed',
        top: 60,
        // 8px margin + 280px action log panel + 8px gap
        left: 296,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(18,18,24,0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
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
          <button style={btnStyle} title="Game actions">
            Actions <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom">
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
          <button style={btnStyle} title="Create objects">
            Create <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom">
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
        style={{ background: 'rgba(18,18,24,0.98)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, paddingLeft: 4 }}>
          Drag a token onto the board
        </p>
        <KeywordTokenGrid templates={DEFAULT_TOKEN_TEMPLATES} columns={5} gap={8} />
      </PopoverContent>
    </Popover>
  );
}
