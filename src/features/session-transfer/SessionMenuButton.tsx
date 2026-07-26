import { useState } from 'react';
import { Save } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { trackSessionExported } from '@/infrastructure/analytics/PosthogFunctions';
import { exportSession, countSnapshotCards } from './exportSession';
import { downloadSnapshot } from './downloadSnapshot';
import { ImportSessionModal } from './ImportSessionModal';

/**
 * Save/load for the whole game, as opposed to `DeckManager`'s save/load for one
 * deck. Kept beside "New Game" because it is the same kind of decision — what
 * happens to the game you are in — rather than something you do to your library.
 *
 * `modal={false}` for the reason the toolbar's other dropdowns use it: an item
 * here mounts a Radix Dialog, and a modal menu closing into a modal dialog can
 * leave `document.body` with `pointer-events: none` restored from the wrong value.
 */
export function SessionMenuButton() {
  const [importOpen, setImportOpen] = useState(false);
  const yDoc = useGameInstance((s) => s.yDoc);
  const roomManager = useGameInstance((s) => s.roomManager);

  const saveToFile = () => {
    if (!yDoc || !roomManager) return;
    const snapshot = exportSession(yDoc, roomManager.getRoomName());
    downloadSnapshot(snapshot);
    trackSessionExported({
      seatCount: snapshot.seats.length,
      cardCount: countSnapshotCards(snapshot),
    });
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            id="session-menu-button"
            data-testid="session-menu"
            aria-label="Save or load a game"
          >
            <span className="toolbar-link-label">GAME </span>
            <Save size={18} style={{ verticalAlign: 'middle' }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={saveToFile}>Save game to file</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            Load saved game…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportSessionModal open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
