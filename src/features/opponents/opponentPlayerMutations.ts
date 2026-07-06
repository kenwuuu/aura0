/**
 * Opponent player mutations
 *
 * Helpers for writing to an opponent's Yjs player map.
 * Ported from OpponentHealthList so both HealthNode and OpponentPileViewers can share them.
 */
import * as Y from 'yjs';
import { YDOC_PLAYER, YSTATE_CUSTOM_COUNTERS, YSTATE_HEALTH } from '@/constants';
import { CustomCounter } from '@/features/player/types';
import { logAction } from '@/features/action-log/actionLog';
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { makeCounterId } from '@/shared/utils/ids';

function getOpponentMap(yDoc: Y.Doc, playerId: string): Y.Map<any> {
  return yDoc.getMap(YDOC_PLAYER(playerId));
}

// Debounced action-log logging, keyed by opponent playerId so rapid +/- presses on
// different opponents' life totals don't clobber each other's pending log entry.
const healthLogTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function modifyOpponentHealth(yDoc: Y.Doc, playerId: string, delta: number): void {
  const map = getOpponentMap(yDoc, playerId);
  const current = (map.get(YSTATE_HEALTH) as number | undefined) ?? 40;
  const newHealth = current + delta;
  map.set(YSTATE_HEALTH, newHealth);

  const actorId = useGameInstance.getState().playerId;
  if (!actorId) return;

  const existingTimer = healthLogTimers.get(playerId);
  if (existingTimer) clearTimeout(existingTimer);

  healthLogTimers.set(playerId, setTimeout(() => {
    healthLogTimers.delete(playerId);
    const finalHealth = (getOpponentMap(yDoc, playerId).get(YSTATE_HEALTH) as number | undefined) ?? newHealth;
    const targetName = resolvePlayerName(yDoc, playerId);
    logAction(yDoc, {
      actorId,
      type: 'health',
      text: `changed ${targetName}'s life (now ${finalHealth})`,
    });
  }, 1000));
}

export function addOpponentCounter(yDoc: Y.Doc, playerId: string, title: string, icon: string): void {
  const map = getOpponentMap(yDoc, playerId);
  const counters = (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [];
  const newCounter: CustomCounter = {
    id: makeCounterId(),
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
