import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { getSeatAlias, clearSeatAlias } from '@/infrastructure/networking';
import { releaseSeat } from './importSession';

/**
 * Is this device sitting in a claimed seat right now?
 *
 * Exported so the settings surface can drop the whole row rather than render an
 * empty one: an ordinary room has no seats to change, and a "Seat" row with
 * nothing in it just raises the question of what it would have done.
 */
export function useHasClaimedSeat(): boolean {
  const roomManager = useGameInstance((s) => s.roomManager);
  const roomName = roomManager?.getRoomName();
  return Boolean(roomName && getSeatAlias(roomName));
}

/**
 * The way out of the wrong seat.
 *
 * Claiming a seat in a restored game is the one action that can show you
 * somebody else's hand, and the picker cannot be perfect: two players can pick
 * at the same instant, and a game saved before anyone had done much can leave
 * two seats looking alike. So the claim is reversible.
 *
 * Releasing is deliberately *only* a local act — it clears this device's alias
 * and reloads into the picker. It does not touch the other player's claim or
 * any game state, because "I picked wrong" is a statement about this browser,
 * not about the game.
 *
 * Renders nothing outside a restored game: an ordinary room has no seats to
 * change, and an empty settings row invites the question of what it is for.
 */
export function ChangeSeatSetting() {
  const roomManager = useGameInstance((s) => s.roomManager);
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const [confirming, setConfirming] = useState(false);

  const roomName = roomManager?.getRoomName();
  if (!roomName || !getSeatAlias(roomName)) return null;


  const release = () => {
    // Hand the seat back to the room as well as to this browser, so it stops
    // reading as taken to the other players. Best-effort: this write races the
    // reload below, and the picker recognises this device's own claim anyway
    // (see readSeatClaims), so a delete that never reaches disk costs nothing.
    if (yDoc && playerId) releaseSeat(yDoc, playerId);

    clearSeatAlias(roomName);
    // A reload rather than a re-render: the seat decides the player id the whole
    // game was wired with at boot, so it is re-read there and nowhere else.
    window.location.reload();
  };

  return (
    <>
      <Button variant="outline" data-testid="change-seat" onClick={() => setConfirming(true)}>
        Change seat
      </Button>

      <ConfirmDialog
        isOpen={confirming}
        title="Change seat?"
        description="This reloads the game and asks which seat is yours again. Nothing in the game itself changes, and the other players aren't affected."
        confirmLabel="Change seat"
        onConfirm={release}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
