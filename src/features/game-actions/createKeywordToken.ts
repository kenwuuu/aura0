import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import { spawnTokenAtPosition } from '@/features/battlefield/spawnToken';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { KeywordToken, KeywordTokenTemplate } from '@/features/keyword-tokens/types';

/**
 * Create a keyword token at the center of the visible board.
 *
 * The desktop flow drags a token from the grid and drops it where the cursor
 * is — but HTML5 drag never fires from touch, so the mobile "tap to add" path
 * (the token tray over the hand) has no drop point. This gives it one: spawn at
 * board center, where the player can then drag it to reposition. Reuses the same
 * `spawnTokenAtPosition` + `screenToFlowPosition` seam as the drop handler and
 * the hotkey path, so peers and the action log see an identical token event.
 */
export function createKeywordTokenAtBoardCenter(template: KeywordTokenTemplate): void {
  const { yDoc, playerId, screenToFlowPosition } = useGameInstance.getState();
  if (!yDoc || !playerId || !screenToFlowPosition) return;

  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const center = screenToFlowPosition({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  spawnTokenAtPosition(template, center, yCards, yTokens, playerId);
}
