import React from 'react';
import { ChevronDown } from 'lucide-react';
import { HandCardsContainer } from './HandCardsContainer';
import { effectiveHandZoom } from './handZoomClamp';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { usePhoneLayout } from '@/shared/hooks';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

export function FloatingHand() {
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const playerId = useGameInstance((s) => s.playerId);
  const zoomLevel = useSettingsStore((s) => s.handZoom);
  const demoHandCards = useSettingsStore((s) => s.demoHandCards);
  const isPhone = usePhoneLayout();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const handleHoveredCardChange = React.useCallback((cardId: string | null) => {
    useHotkeyStore.getState().setHoveredHandCard(cardId);
  }, []);

  if (!yPlayerState || !playerId) return null;

  return (
    <div
      data-pile-type="hand"
      data-pile-owner={playerId}
      style={
        // The hand owns the bottom edge: absorb the home-bar safe-area inset.
        // Phone: edge-to-edge (docs/architecture/responsive.md); desktop: centered.
        // A flex column stacks the tray tab above the hand so collapsing the hand's
        // row (see below) pulls the tab down with it to rest at the bottom edge,
        // rather than leaving it floating where the hand used to be.
        isPhone
          ? {
              position: 'fixed',
              bottom: 'env(safe-area-inset-bottom, 0px)',
              left: 0,
              right: 0,
              zIndex: 950,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }
          : {
              position: 'fixed',
              bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 950,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }
      }
    >
      <button
        type="button"
        onClick={() => setIsCollapsed((v) => !v)}
        aria-label={isCollapsed ? 'Expand hand' : 'Collapse hand'}
        aria-expanded={!isCollapsed}
        data-testid="hand-collapse-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 120,
          height: 18,
          // Rounded on top only and no bottom border: the tab reads as the lip of
          // a tray the hand slides into, flush against the cards below it.
          borderRadius: '10px 10px 0 0',
          border: '1px solid #4a4a4a',
          borderBottom: 'none',
          background: 'rgba(26, 26, 26, 0.85)',
          color: '#d1d5db',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d';
          (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#6b7280';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26, 26, 26, 0.85)';
          (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#4a4a4a';
        }}
      >
        <ChevronDown
          size={14}
          style={{
            transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: prefersReducedMotion ? 'none' : 'transform 0.2s ease',
          }}
        />
      </button>
      <div
        style={{
          width: isPhone ? '100%' : undefined,
          // Animate to/from intrinsic height without measuring it in JS: a grid
          // row sized in fr units tweens between 1fr (full content) and 0fr
          // (nothing) the same way height:auto can't.
          display: 'grid',
          gridTemplateRows: isCollapsed ? '0fr' : '1fr',
          transition: prefersReducedMotion ? 'none' : 'grid-template-rows 0.25s ease',
        }}
      >
        <div
          aria-hidden={isCollapsed}
          style={{ overflow: 'hidden', minHeight: 0, pointerEvents: isCollapsed ? 'none' : undefined }}
        >
          <HandCardsContainer
            yPlayerState={yPlayerState}
            playerId={playerId}
            zoomLevel={effectiveHandZoom(zoomLevel, isPhone)}
            fullWidth={isPhone}
            onHoveredCardChange={handleHoveredCardChange}
            overrideCards={demoHandCards ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
