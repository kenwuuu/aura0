/**
 * Unit tests for modifyOpponentHealth's debounced action-log entry.
 *
 * Uses a real Y.Doc (not a mock) and fake timers so the debounce window can
 * be advanced deterministically. The core thing under test: the per-opponent
 * timer Map must not let one opponent's pending log entry clobber another's
 * when both are modified within the same debounce window.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import {
  modifyOpponentHealth,
  addOpponentCounter,
  modifyOpponentCounter,
  removeOpponentCounter,
} from './opponentPlayerMutations';
import { getActionLog } from '@/features/action-log/actionLog';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME, YSTATE_CUSTOM_COUNTERS } from '@/constants';
import type { CustomCounter } from '@/features/player/types';

function makeDoc(): Y.Doc {
  return new Y.Doc();
}

// resolvePlayerName falls back to playerId.slice(0, 9) when no name is set, which
// collapses ids sharing a prefix (e.g. "opponent-a"/"opponent-b") to the same text.
// Set explicit names so log entries for different opponents stay distinguishable.
function setPlayerName(doc: Y.Doc, playerId: string, name: string): void {
  doc.getMap(YDOC_PLAYER(playerId)).set(YSTATE_PLAYER_NAME, name);
}

beforeEach(() => {
  vi.useFakeTimers();
  useGameInstance.getState().setPlayerId('local-player');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('modifyOpponentHealth debounced logging', () => {
  it('logs a single debounced entry after rapid presses on one opponent', () => {
    const doc = makeDoc();

    modifyOpponentHealth(doc, 'opponent-a', -1);
    modifyOpponentHealth(doc, 'opponent-a', -1);
    modifyOpponentHealth(doc, 'opponent-a', -1);

    vi.advanceTimersByTime(1000);

    const entries = getActionLog(doc).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('now 37');
  });

  it('does not let interleaved presses on a second opponent clobber the first opponent\'s pending entry', () => {
    const doc = makeDoc();
    setPlayerName(doc, 'opponent-a', 'Alice');
    setPlayerName(doc, 'opponent-b', 'Bob');

    // Interleave presses on two different opponents within the same debounce window.
    modifyOpponentHealth(doc, 'opponent-a', -1);
    modifyOpponentHealth(doc, 'opponent-b', -1);
    modifyOpponentHealth(doc, 'opponent-a', -1);
    modifyOpponentHealth(doc, 'opponent-b', -1);

    vi.advanceTimersByTime(1000);

    const entries = getActionLog(doc).toArray();

    // Each opponent must get its own logged entry — a single shared timer
    // would have let opponent-b's presses clear opponent-a's pending timeout
    // (and vice versa), silently dropping one of the two log entries.
    expect(entries).toHaveLength(2);

    const aliceEntry = entries.find((e) => e.text.includes('Alice'));
    const bobEntry = entries.find((e) => e.text.includes('Bob'));
    expect(aliceEntry?.text).toContain('now 38');
    expect(bobEntry?.text).toContain('now 38');
  });

  it('only logs the final health value when presses on the same opponent collapse', () => {
    const doc = makeDoc();

    modifyOpponentHealth(doc, 'opponent-a', -1); // 39
    vi.advanceTimersByTime(500);
    modifyOpponentHealth(doc, 'opponent-a', -1); // 38, resets the timer
    vi.advanceTimersByTime(500);
    // Original 1000ms timer would have fired by now if not reset by the second call.
    expect(getActionLog(doc).toArray()).toHaveLength(0);

    vi.advanceTimersByTime(500);
    const entries = getActionLog(doc).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('now 38');
  });
});

describe('addOpponentCounter / modifyOpponentCounter / removeOpponentCounter', () => {
  it('adds a counter with the given title/icon starting at 0', () => {
    const doc = makeDoc();

    addOpponentCounter(doc, 'opponent-a', 'Poison', '☠️');

    const counters = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ title: 'Poison', icon: '☠️', value: 0 });
  });

  it('modifies the matching counter by delta, leaving others untouched', () => {
    const doc = makeDoc();
    addOpponentCounter(doc, 'opponent-a', 'Poison', '☠️');
    addOpponentCounter(doc, 'opponent-a', 'Energy', '⚡');
    const [poison, energy] = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];

    modifyOpponentCounter(doc, 'opponent-a', poison.id, 3);

    const counters = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
    expect(counters.find((c) => c.id === poison.id)!.value).toBe(3);
    expect(counters.find((c) => c.id === energy.id)!.value).toBe(0);
  });

  it('removes the matching counter only', () => {
    const doc = makeDoc();
    addOpponentCounter(doc, 'opponent-a', 'Poison', '☠️');
    addOpponentCounter(doc, 'opponent-a', 'Energy', '⚡');
    const [poison, energy] = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];

    removeOpponentCounter(doc, 'opponent-a', poison.id);

    const counters = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
    expect(counters.map((c) => c.id)).toEqual([energy.id]);
  });

  it('keeps counters scoped to the target opponent', () => {
    const doc = makeDoc();

    addOpponentCounter(doc, 'opponent-a', 'Poison', '☠️');
    addOpponentCounter(doc, 'opponent-b', 'Energy', '⚡');

    const aCounters = doc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
    const bCounters = doc.getMap(YDOC_PLAYER('opponent-b')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
    expect(aCounters).toHaveLength(1);
    expect(bCounters).toHaveLength(1);
    expect(aCounters[0].title).toBe('Poison');
    expect(bCounters[0].title).toBe('Energy');
  });
});