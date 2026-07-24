import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import * as Y from 'yjs';
import { TimerNode } from './TimerNode';
import { renderNode } from '@/test/nodeHarness';
import { YDOC_TIMERS } from '@/constants';
import { DEFAULT_TIMER_MS, STEP_MS } from '../timers/timerLogic';
import type { BoardTimer } from '../timers/types';

const NODE_ID = 'timer-1';

function makeTimer(overrides: Partial<BoardTimer> = {}): BoardTimer {
  return {
    id: NODE_ID,
    ownerId: 'p1',
    x: 0,
    y: 0,
    zIndex: 1,
    rotation: 0,
    mode: 'timer',
    running: false,
    startedAt: null,
    baseMs: DEFAULT_TIMER_MS,
    durationMs: DEFAULT_TIMER_MS,
    ...overrides,
  };
}

/** Render TimerNode over a fresh Yjs timers map seeded with `timer`. Assertions
 *  read the map back (the isolated node has no observer to re-render it). */
function renderTimer(timer = makeTimer()) {
  const yDoc = new Y.Doc();
  const yTimers = yDoc.getMap<BoardTimer>(YDOC_TIMERS);
  yTimers.set(NODE_ID, timer);
  const result = renderNode(
    TimerNode,
    { ...timer, yTimers, localPlayerId: 'p1' },
    { playerId: 'p1', nodeProps: { id: NODE_ID } },
  );
  return { ...result, yTimers };
}

describe('TimerNode — controls write through to Yjs', () => {
  it('renders a stopped default timer at 05:00', () => {
    renderTimer();
    const display = screen.getByTestId('timer-display');
    expect(display).toHaveTextContent('05:00');
  });

  it('Start sets it running', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(yTimers.get(NODE_ID)?.running).toBe(true);
  });

  it('Pause stops a running timer', () => {
    const { yTimers } = renderTimer(makeTimer({ running: true, startedAt: Date.now() }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(yTimers.get(NODE_ID)?.running).toBe(false);
  });

  it('+30s / −30s adjust the length', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Add 30 seconds' }));
    expect(yTimers.get(NODE_ID)?.baseMs).toBe(DEFAULT_TIMER_MS + STEP_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Subtract 30 seconds' }));
    expect(yTimers.get(NODE_ID)?.baseMs).toBe(DEFAULT_TIMER_MS);
  });

  it('Reset returns a paused timer to its duration', () => {
    const { yTimers } = renderTimer(makeTimer({ baseMs: 12_000, durationMs: DEFAULT_TIMER_MS }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(yTimers.get(NODE_ID)?.baseMs).toBe(DEFAULT_TIMER_MS);
  });

  it('switching to Stopwatch changes mode', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Stopwatch' }));
    expect(yTimers.get(NODE_ID)?.mode).toBe('stopwatch');
  });

  it('a stopwatch hides the ±30s step buttons', () => {
    renderTimer(makeTimer({ mode: 'stopwatch', baseMs: 0 }));
    expect(screen.queryByRole('button', { name: 'Add 30 seconds' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subtract 30 seconds' })).not.toBeInTheDocument();
  });

  it('Remove deletes the timer', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Remove timer' }));
    expect(yTimers.has(NODE_ID)).toBe(false);
  });
});

describe('TimerNode — inline digit editing', () => {
  it('editing the minutes segment sets an exact duration', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByText('05')); // the mm segment
    const input = screen.getByTestId('timer-edit-minutes');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(yTimers.get(NODE_ID)).toMatchObject({ baseMs: 10 * 60 * 1000, durationMs: 10 * 60 * 1000 });
  });

  it('caps the digit input to two characters', () => {
    const { yTimers } = renderTimer();
    fireEvent.click(screen.getByText('05'));
    const input = screen.getByTestId('timer-edit-minutes');
    fireEvent.change(input, { target: { value: '150' } }); // stripped to "15"
    fireEvent.blur(input);
    expect(yTimers.get(NODE_ID)?.baseMs).toBe(15 * 60 * 1000);
  });

  it('does not offer editing while running', () => {
    renderTimer(makeTimer({ running: true, startedAt: Date.now() }));
    fireEvent.click(screen.getByTestId('timer-display'));
    expect(screen.queryByTestId('timer-edit-minutes')).not.toBeInTheDocument();
  });
});
