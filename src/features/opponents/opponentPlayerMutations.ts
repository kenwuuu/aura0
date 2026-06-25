/**
 * Opponent player mutations
 *
 * Helpers for writing to an opponent's Yjs player map.
 * Ported from OpponentHealthList so both HealthNode and OpponentPileViewers can share them.
 */
import * as Y from 'yjs';
import { YDOC_PLAYER, YSTATE_CUSTOM_COUNTERS, YSTATE_HEALTH } from '@/constants';
import { CustomCounter } from '@/features/player/types';

function getOpponentMap(yDoc: Y.Doc, playerId: string): Y.Map<any> {
  return yDoc.getMap(YDOC_PLAYER(playerId));
}

export function modifyOpponentHealth(yDoc: Y.Doc, playerId: string, delta: number): void {
  const map = getOpponentMap(yDoc, playerId);
  const current = (map.get(YSTATE_HEALTH) as number | undefined) ?? 40;
  map.set(YSTATE_HEALTH, current + delta);
}

export function addOpponentCounter(yDoc: Y.Doc, playerId: string, title: string, icon: string): void {
  const map = getOpponentMap(yDoc, playerId);
  const counters = (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [];
  const newCounter: CustomCounter = {
    id: `counter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    icon,
    value: 0,
  };
  map.set(YSTATE_CUSTOM_COUNTERS, [...counters, newCounter]);
}

export function modifyOpponentCounter(yDoc: Y.Doc, playerId: string, counterId: string, delta: number): void {
  const map = getOpponentMap(yDoc, playerId);
  const counters = (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [];
  map.set(YSTATE_CUSTOM_COUNTERS,
    counters.map((c) => c.id === counterId ? { ...c, value: c.value + delta } : c)
  );
}

export function removeOpponentCounter(yDoc: Y.Doc, playerId: string, counterId: string): void {
  const map = getOpponentMap(yDoc, playerId);
  const counters = (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [];
  map.set(YSTATE_CUSTOM_COUNTERS, counters.filter((c) => c.id !== counterId));
}
