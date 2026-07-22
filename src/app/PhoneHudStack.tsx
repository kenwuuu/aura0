/**
 * PhoneHudStack — the phone-layout replacement for the two draggable HUD
 * windows (game-actions toolbar + action log). Below the `sm` breakpoint the
 * panels neither float nor drag; each collapses to a HudIconButton in a fixed
 * column at the top-left of the screen and expands out of its button in
 * place: the open panel's top-left corner is the button itself, which stays
 * visible there — tapping it again collapses. Opening the top panel pushes
 * the unit below it down the column. See docs/architecture/responsive.md ("Phone screen
 * map"); desktop keeps ActionLogPanel/GameActionsToolbar (see App.tsx).
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import * as Y from 'yjs';
import { Swords, ScrollText } from 'lucide-react';
import { HudIconButton } from '@/shared/ui/HudIconButton';
import { panelFrameStyle } from '@/shared/ui/FloatingPanel';
import { getTopBarBottom } from '@/shared/ui/useDraggablePanel';
import { GameActionsContent } from '@/features/game-actions/GameActionsToolbar';
import { ActionLogBody } from '@/features/action-log/ActionLogPanel';

/** One toggle-button-or-panel unit. Closed: just the button. Open: a framed
 * panel whose top-left element is that same button, so the panel visually
 * grows out of the button's corner. */
function HudUnit({
  icon,
  label,
  ariaLabel,
  testId,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  testId: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const button = (
    <HudIconButton
      icon={icon}
      ariaLabel={ariaLabel}
      ariaExpanded={open}
      onClick={onToggle}
      testId={testId}
    />
  );

  if (!open) return button;

  return (
    <div style={{ ...panelFrameStyle, maxWidth: 'calc(100vw - 16px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {button}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            userSelect: 'none',
            paddingRight: 10,
          }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export function PhoneHudStack({ yDoc, localPlayerId }: { yDoc: Y.Doc; localPlayerId: string }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // Anchor just below the toolbar; measured (not hardcoded) because the
  // toolbar's height varies with safe-area padding and orientation.
  const [top, setTop] = useState(() => getTopBarBottom() + 8);
  useEffect(() => {
    const update = () => setTop(getTopBarBottom() + 8);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left: 'calc(8px + env(safe-area-inset-left, 0px))',
        zIndex: 40, // HUD band — below hand (950) and toolbar (1000)
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <HudUnit
        icon={<Swords size={16} aria-hidden="true" />}
        label="Game Actions"
        ariaLabel="Toggle game actions"
        testId="phone-hud-game-actions-toggle"
        open={actionsOpen}
        onToggle={() => setActionsOpen((v) => !v)}
      >
        <GameActionsContent style={{ flexWrap: 'wrap' }} />
      </HudUnit>

      <HudUnit
        icon={<ScrollText size={16} aria-hidden="true" />}
        label="Action Log"
        ariaLabel="Toggle action log"
        testId="phone-hud-action-log-toggle"
        open={logOpen}
        onToggle={() => setLogOpen((v) => !v)}
      >
        <div style={{ width: 'min(280px, calc(100vw - 16px))' }}>
          <ActionLogBody yDoc={yDoc} localPlayerId={localPlayerId} />
        </div>
      </HudUnit>
    </div>
  );
}
