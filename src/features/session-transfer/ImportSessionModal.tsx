import { useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { parseSnapshot } from './parseSnapshot';
import { countSnapshotCards } from './exportSession';
import { startImport } from './startImport';
import type { SessionSnapshot } from './sessionSnapshot';

/**
 * Pick a saved game, confirm it is the right one, and say which player you are.
 *
 * The seat choice happens *here*, before any navigation, because the importing
 * player is the one holding the file and is the only person who can answer it.
 * Everyone else answers the same question later, on `SeatSelectionScreen`, from
 * the link this produces.
 */
export function ImportSessionModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInputId = useId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSnapshot(null);
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();

    const result = parseSnapshot(await file.text());
    if (result.ok) setSnapshot(result.snapshot);
    else setError(result.error);
  };

  const resume = (seatId: string) => {
    try {
      startImport(snapshot!, seatId);
    } catch {
      setError('Could not stage that game. Try closing other tabs and importing again.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="session-import-modal">
        <DialogHeader>
          <DialogTitle>Load a saved game</DialogTitle>
          <DialogDescription>
            Pick a game you saved earlier. It opens in a new room — share the link with the other
            players so they can take their seats.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor={fileInputId} style={{ fontSize: 13 }}>
            Saved game file
          </label>
          <input
            id={fileInputId}
            type="file"
            accept="application/json,.json"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}

          {snapshot && (
            <>
              <p style={{ fontSize: 13, margin: 0 }}>
                {snapshot.seats.length} players · {countSnapshotCards(snapshot)} cards · saved{' '}
                {new Date(snapshot.exportedAt).toLocaleDateString()}
              </p>
              <p style={{ fontSize: 13, margin: 0 }}>Which player are you?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {snapshot.seats.map((seat) => (
                  <Button
                    key={seat.seatId}
                    variant="outline"
                    data-testid="import-seat-option"
                    onClick={() => resume(seat.seatId)}
                  >
                    {seat.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
