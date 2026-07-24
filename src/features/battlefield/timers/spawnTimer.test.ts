import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YDOC_TIMERS, YDOC_CARDS_ON_BOARD, YDOC_ACTION_LOG } from '@/constants';
import { DEFAULT_TIMER_MS, TIMER_WIDTH, TIMER_HEIGHT, STEP_MS } from './timerLogic';
import type { BoardTimer } from './types';
import {
  createTimerAtPosition,
  toggleTimerRunning,
  resetTimer,
  adjustTimer,
  setTimerMode,
  setTimerDuration,
  removeTimer,
  moveTimer,
} from './spawnTimer';

const timers = (doc: Y.Doc) => doc.getMap<BoardTimer>(YDOC_TIMERS);

afterEach(() => vi.restoreAllMocks());

describe('createTimerAtPosition', () => {
  it('centers the timer on the point and starts as a stopped 5:00 countdown', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 100, y: 100 });
    expect(timers(doc).get(id)).toMatchObject({
      ownerId: 'p1',
      x: 100 - TIMER_WIDTH / 2,
      y: 100 - TIMER_HEIGHT / 2,
      mode: 'timer',
      running: false,
      startedAt: null,
      baseMs: DEFAULT_TIMER_MS,
      durationMs: DEFAULT_TIMER_MS,
    });
  });

  it('stacks above every existing board object', () => {
    const doc = new Y.Doc();
    doc.getMap(YDOC_CARDS_ON_BOARD).set('c1', { zIndex: 7 });
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    expect(timers(doc).get(id)!.zIndex).toBe(8);
  });

  it('logs the creation to the shared action log', () => {
    const doc = new Y.Doc();
    createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    const log = doc.getArray(YDOC_ACTION_LOG).toArray() as Array<{ type: string }>;
    expect(log.some((e) => e.type === 'spawn_timer')).toBe(true);
  });
});

describe('per-instance mutations', () => {
  it('start freezes the elapsed remaining into base on the next pause', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    toggleTimerRunning(timers(doc), id);
    expect(timers(doc).get(id)).toMatchObject({ running: true, startedAt: 1_000 });

    vi.spyOn(Date, 'now').mockReturnValue(4_000); // 3s later
    toggleTimerRunning(timers(doc), id);
    expect(timers(doc).get(id)).toMatchObject({ running: false, baseMs: DEFAULT_TIMER_MS - 3_000 });
  });

  it('reset stops the clock and returns it to the duration', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(0);
    toggleTimerRunning(timers(doc), id);
    resetTimer(timers(doc), id);
    expect(timers(doc).get(id)).toMatchObject({ running: false, startedAt: null, baseMs: DEFAULT_TIMER_MS });
  });

  it('±30s adjusts a stopped timer and its reset baseline', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    adjustTimer(timers(doc), id, STEP_MS);
    expect(timers(doc).get(id)).toMatchObject({
      baseMs: DEFAULT_TIMER_MS + STEP_MS,
      durationMs: DEFAULT_TIMER_MS + STEP_MS,
    });
  });

  it('switching mode to stopwatch resets to zero', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    setTimerMode(timers(doc), id, 'stopwatch');
    expect(timers(doc).get(id)).toMatchObject({ mode: 'stopwatch', baseMs: 0, running: false });
  });

  it('setTimerDuration sets an exact length', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    setTimerDuration(timers(doc), id, 90_000);
    expect(timers(doc).get(id)).toMatchObject({ baseMs: 90_000, durationMs: 90_000, mode: 'timer' });
  });

  it('moveTimer commits position and z', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    moveTimer(timers(doc), id, 42, 84, 99);
    expect(timers(doc).get(id)).toMatchObject({ x: 42, y: 84, zIndex: 99 });
  });

  it('removeTimer deletes it', () => {
    const doc = new Y.Doc();
    const id = createTimerAtPosition(doc, 'p1', { x: 0, y: 0 });
    removeTimer(timers(doc), id);
    expect(timers(doc).has(id)).toBe(false);
  });

  it('mutating a missing id is a no-op, not a throw', () => {
    const doc = new Y.Doc();
    expect(() => {
      toggleTimerRunning(timers(doc), 'nope');
      resetTimer(timers(doc), 'nope');
      adjustTimer(timers(doc), 'nope', STEP_MS);
      moveTimer(timers(doc), 'nope', 1, 2, 3);
    }).not.toThrow();
    expect(timers(doc).size).toBe(0);
  });
});
