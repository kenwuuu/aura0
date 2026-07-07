import React from 'react';
import { DoorOpen } from 'lucide-react';
import posthog from 'posthog-js';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

/** Navigates to the app root (no `?room=`), the same URL a brand new visitor
 *  would land on — RoomManager generates a fresh room id from there. */
function startNewGame() {
  window.location.href = window.location.origin + window.location.pathname;
}

export const NewGameButton: React.FC = () => {
  const roomManager = useGameInstance((s) => s.roomManager);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    useConfirmStore.getState().open({
      title: 'Start a New Game?',
      description:
        "This opens a new room with a different room ID. You can use your browser's back button to come back to your current room.",
      confirmLabel: 'New Game',
      destructive: true,
      onConfirm: () => {
        if (roomManager) posthog.capture('new_game_started', { previous_room: roomManager.getRoomName() });
        startNewGame();
      },
    });
  };

  return (
    <button
      id="new-game-button"
      data-testid="new-game-button"
      onClick={handleClick}
      aria-label="Start a new game in a new room"
    >
      {/* Text collapses below `sm` (see "Toolbar responsive collapse" in
          style.css); the icon plus aria-label above stay the affordance. */}
      <span className="toolbar-link-label">NEW GAME </span>
      <DoorOpen size={18} style={{ verticalAlign: 'middle' }} />
    </button>
  );
};
