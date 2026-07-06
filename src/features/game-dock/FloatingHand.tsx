import React from 'react';
import { HandCardsContainer } from './HandCardsContainer';
import { usePlayerStore } from '@/app/stores/playerStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useSettingsStore } from '@/app/stores/settingsStore';

export function FloatingHand() {
  const yPlayerState = usePlayerStore((s) => s.yPlayerState);
  const playerId = useGameInstance((s) => s.playerId);
  const zoomLevel = useSettingsStore((s) => s.handZoom);
  const demoHandCards = useSettingsStore((s) => s.demoHandCards);

  const handleHoveredCardChange = React.useCallback((cardId: string | null) => {
    useHotkeyStore.getState().setHoveredHandCard(cardId);
  }, []);

  if (!yPlayerState || !playerId) return null;

  return (
    <div
      data-pile-type="hand"
      data-pile-owner={playerId}
      style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 950 }}
    >
      <HandCardsContainer
        yPlayerState={yPlayerState}
        playerId={playerId}
        zoomLevel={zoomLevel}
        onHoveredCardChange={handleHoveredCardChange}
        overrideCards={demoHandCards ?? undefined}
      />
    </div>
  );
}
