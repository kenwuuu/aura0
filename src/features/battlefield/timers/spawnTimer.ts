/**
 * Yjs writers for board timers. Creation plus the per-instance mutations the
 * TimerNode controls call — each reads the latest object, applies a pure
 * transition from `timerLogic`, and writes it back, matching the card/token
 * write pattern ("complete semantic actions": the mutation is the whole event).
 */
import * as Y from 'yjs';
import {
  YDOC_TIMERS,
  YDOC_CARDS_ON_BOARD,
  YDOC_KEYWORD_TOKENS,
} from '@/constants';
import { logAction } from '@/features/action-log/actionLog';
import { makeTimerId } from '@/shared/utils/ids';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import type { BoardTimer, TimerMode } from './types';
import {
  DEFAULT_TIMER_MS,
  TIMER_WIDTH,
  TIMER_HEIGHT,
  toggledTimer,
  resetTimerState,
  adjustedTimer,
  withMode,
  withDuration,
} from './timerLogic';

/** Highest zIndex across every board object, so a new/dragged timer lands on
 *  top. Cards, tokens, and timers all carry `zIndex`, so we scan them
 *  structurally without importing their full types. */
// Y.Map is invariant in its value type, so the three maps (cards/tokens/timers)
// can't share one element type — accept `any` and read only `zIndex`.
function maxZIndex(...maps: Array<Y.Map<any>>): number {
  let max = 1;
  for (const m of maps) m.forEach((v: { zIndex: number }) => { if (v.zIndex > max) max = v.zIndex; });
  return max;
}

/** Create a timer centered on a board (flow) coordinate. The testable core that
 *  takes its doc explicitly. */
export function createTimerAtPosition(
  yDoc: Y.Doc,
  ownerId: string,
  flowPos: { x: number; y: number },
): string {
  const yTimers = yDoc.getMap<BoardTimer>(YDOC_TIMERS);
  const yCards = yDoc.getMap<{ zIndex: number }>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<{ zIndex: number }>(YDOC_KEYWORD_TOKENS);

  const id = makeTimerId();
  yTimers.set(id, {
    id,
    ownerId,
    x: flowPos.x - TIMER_WIDTH / 2,
    y: flowPos.y - TIMER_HEIGHT / 2,
    zIndex: maxZIndex(yCards, yTokens, yTimers) + 1,
    rotation: 0,
    mode: 'timer',
    running: false,
    startedAt: null,
    baseMs: DEFAULT_TIMER_MS,
    durationMs: DEFAULT_TIMER_MS,
  });

  logAction(yDoc, { actorId: ownerId, type: 'spawn_timer', text: 'placed a timer' });
  return id;
}

/**
 * Create a timer from a screen point (defaults to the viewport center), reading
 * the live game instance and converting through the canvas's
 * `screenToFlowPosition`. The single entry point the toolbar, ⌘K palette, and
 * board context menu all call, so the three surfaces can't drift.
 */
export function createTimerFromScreenPoint(screen?: { x: number; y: number }): string | null {
  const { yDoc, playerId, screenToFlowPosition } = useGameInstance.getState();
  if (!yDoc || !playerId) return null;
  const point = screen ?? {
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  };
  const flowPos = screenToFlowPosition ? screenToFlowPosition(point) : point;
  return createTimerAtPosition(yDoc, playerId, flowPos);
}

// ── Per-instance mutations ─────────────────────────────────────────────────────

function update(yTimers: Y.Map<BoardTimer>, id: string, fn: (t: BoardTimer) => BoardTimer): void {
  const t = yTimers.get(id);
  if (!t) return;
  const next = fn(t);
  if (next !== t) yTimers.set(id, next);
}

export function toggleTimerRunning(yTimers: Y.Map<BoardTimer>, id: string): void {
  update(yTimers, id, (t) => toggledTimer(t, Date.now()));
}

export function resetTimer(yTimers: Y.Map<BoardTimer>, id: string): void {
  update(yTimers, id, resetTimerState);
}

export function adjustTimer(yTimers: Y.Map<BoardTimer>, id: string, deltaMs: number): void {
  update(yTimers, id, (t) => adjustedTimer(t, deltaMs, Date.now()));
}

export function setTimerMode(yTimers: Y.Map<BoardTimer>, id: string, mode: TimerMode): void {
  update(yTimers, id, (t) => withMode(t, mode));
}

export function setTimerDuration(yTimers: Y.Map<BoardTimer>, id: string, durationMs: number): void {
  update(yTimers, id, (t) => withDuration(t, durationMs));
}

export function removeTimer(yTimers: Y.Map<BoardTimer>, id: string): void {
  yTimers.delete(id);
}

/** Commit a timer's position + z after a drag. */
export function moveTimer(
  yTimers: Y.Map<BoardTimer>,
  id: string,
  x: number,
  y: number,
  zIndex: number,
): void {
  update(yTimers, id, (t) => ({ ...t, x, y, zIndex }));
}
