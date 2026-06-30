/**
 * Resolve a stable playerId to a human-readable display name.
 *
 * Reads the YSTATE_PLAYER_NAME key from the player's per-player Yjs map,
 * falling back to the first 9 characters of the ID (the default used when
 * no name has been set). This is the same pattern used in:
 *   - src/features/battlefield/usePlaymatNodes.ts
 *   - src/features/opponents/OpponentPileViewers.tsx
 * Centralised here to avoid a third copy.
 */

import * as Y from 'yjs';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME } from '@/constants';

export function resolvePlayerName(yDoc: Y.Doc, playerId: string): string {
  const map = yDoc.getMap(YDOC_PLAYER(playerId));
  return (map.get(YSTATE_PLAYER_NAME) as string | undefined) ?? playerId.slice(0, 9);
}
