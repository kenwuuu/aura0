/**
 * Start a new game — shared by the toolbar's "New Game" button and the command
 * palette's "New game" command, so the confirmation, the analytics capture, and
 * the navigation stay identical wherever they're invoked from.
 */
import posthog from 'posthog-js';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

/** Navigates to the app root (no `?room=`), the same URL a brand new visitor
 *  would land on — RoomManager generates a fresh room id from there. */
function navigateToNewGame() {
  window.location.href = window.location.origin + window.location.pathname;
}

/** Opens the shared confirm dialog; on confirm, captures the event and navigates. */
export function requestNewGame() {
  useConfirmStore.getState().open({
    title: 'Start a New Game?',
    description:
      "This opens a new room with a different room ID. You can use your browser's back button to come back to your current room.",
    confirmLabel: 'New Game',
    destructive: true,
    onConfirm: () => {
      const roomManager = useGameInstance.getState().roomManager;
      if (roomManager) posthog.capture('new_game_started', { previous_room: roomManager.getRoomName() });
      navigateToNewGame();
    },
  });
}
