import React from 'react';
import { HandCardsContainer } from './HandCardsContainer';
import { effectiveHandZoom } from './handZoomClamp';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { usePhoneLayout } from '@/shared/hooks';

export function FloatingHand() {
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const playerId = useGameInstance((s) => s.playerId);
  const zoomLevel = useSettingsStore((s) => s.handZoom);
  const demoHandCards = useSettingsStore((s) => s.demoHandCards);
  const isPhone = usePhoneLayout();

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
        // Phone: edge-to-edge (docs/responsive.md); desktop: centered.
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
      <HandCardsContainer
        yPlayerState={yPlayerState}
        playerId={playerId}
        zoomLevel={effectiveHandZoom(zoomLevel, isPhone)}
        fullWidth={isPhone}
        onHoveredCardChange={handleHoveredCardChange}
        overrideCards={demoHandCards ?? undefined}
      />
    </div>
  );
}
