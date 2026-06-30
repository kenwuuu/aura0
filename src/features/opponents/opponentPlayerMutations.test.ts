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
import { modifyOpponentHealth } from './opponentPlayerMutations';
import { getActionLog } from '@/features/action-log/actionLog';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME } from '@/constants';

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