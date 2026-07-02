import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { CursorState } from './awareness';
import { colorFromPlayerId } from '@/features/player';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME, YSTATE_PLAYER_COLOR } from '@/constants';

export interface PeerCursor {
  clientId: number;
  x: number;
  y: number;
  name: string;
  color: string;
}

export function usePeerCursors(awareness: Awareness | null, yDoc: Y.Doc | null): PeerCursor[] {
  const [cursors, setCursors] = useState<PeerCursor[]>([]);

  useEffect(() => {
    if (!awareness) return;
    const onChange = () => {
      const next: PeerCursor[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const cursor = state.cursor as CursorState | null | undefined;
        if (!cursor) return;
        const playerId = state.playerId as string | undefined;
        const playerMap = playerId && yDoc ? yDoc.getMap(YDOC_PLAYER(playerId)) : null;
        const yjsName = playerMap?.get(YSTATE_PLAYER_NAME) as string | undefined;
        const yjsColor = playerMap?.get(YSTATE_PLAYER_COLOR) as string | undefined;
        const name = yjsName ?? (state.name as string | undefined) ?? `peer-${clientId}`;
        const color = yjsColor ?? colorFromPlayerId(playerId ?? String(clientId));
        next.push({ clientId, x: cursor.x, y: cursor.y, name, color });
      });
      setCursors(next);
    };
    awareness.on('change', onChange);
    return () => awareness.off('change', onChange);
  }, [awareness, yDoc]);

  return cursors;
}
