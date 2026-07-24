import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HandCardsContainer } from './HandCardsContainer';
import { effectiveHandZoom } from './handZoomClamp';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { usePhoneLayout } from '@/shared/hooks';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { HudIconButton } from '@/shared/ui/HudIconButton';

export function FloatingHand() {
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const playerId = useGameInstance((s) => s.playerId);
  const zoomLevel = useSettingsStore((s) => s.handZoom);
  const demoHandCards = useSettingsStore((s) => s.demoHandCards);
  const isPhone = usePhoneLayout();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleHoveredCardChange = React.useCallback((cardId: string | null) => {
    useHotkeyStore.getState().setHoveredHandCard(cardId);
  }, []);

  const handleToggleCollapsed = React.useCallback(() => {
    setIsCollapsed((v) => !v);
  }, []);

  if (!yPlayerState || !playerId) return null;

  return (
    <div
      data-pile-type="hand"
      data-pile-owner={playerId}
      style={
        // The hand owns the bottom edge: absorb the home-bar safe-area inset.
        // Phone: edge-to-edge (docs/architecture/responsive.md); desktop: centered.
        isPhone
          ? {
              position: 'fixed',
              bottom: 'env(safe-area-inset-bottom, 0px)',
              left: 0,
              right: 0,
              zIndex: 950,
            }
          : {
              position: 'fixed',
              bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 950,
            }
      }
    >
      <div
        style={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <HudIconButton
          icon={
            <ChevronDown
              size={16}
              style={{
                transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: prefersReducedMotion ? 'none' : 'transform 0.2s ease',
              }}
            />
          }
          ariaLabel={isCollapsed ? 'Show hand' : 'Hide hand'}
          ariaExpanded={!isCollapsed}
          onClick={handleToggleCollapsed}
          testId="hand-collapse-toggle"
        />
      </div>
      <div
        data-testid="hand-collapse-region"
        aria-hidden={isCollapsed}
        style={{
          overflow: 'hidden',
          transform: isCollapsed ? 'translateY(100%)' : 'translateY(0%)',
          opacity: isCollapsed ? 0 : 1,
          pointerEvents: isCollapsed ? 'none' : undefined,
          transition: prefersReducedMotion ? 'none' : 'transform 0.25s ease, opacity 0.2s ease',
        }}
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
  );
}
