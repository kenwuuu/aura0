/**
 * Unit tests for Player's opponent-targeting behavior.
 *
 * modifyHealth, addCustomCounter, modifyCustomCounter, and removeCustomCounter
 * all accept an optional targetPlayerId so the local Player instance can
 * mutate an opponent's Yjs state through the same debounce/log machinery as
 * self-mutations, instead of a separate opponentPlayerMutations module.
 *
 * Uses a real Y.Doc (not a mock) and fake timers so the debounce window can be
 * advanced deterministically. The core thing under test: per-target keying
 * must not let one target's pending log entry clobber another's (including
 * the local player's own).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import { getActionLog } from '@/features/action-log/actionLog';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME, YSTATE_CUSTOM_COUNTERS } from '@/constants';
import type { CustomCounter } from './types';

function setPlayerName(doc: Y.Doc, playerId: string, name: string): void {
  doc.getMap(YDOC_PLAYER(playerId)).set(YSTATE_PLAYER_NAME, name);
}

/** Constructing the local Player also logs their join, so scope to health entries. */
function healthEntries(doc: Y.Doc) {
  return getActionLog(doc).toArray().filter((e) => e.type === 'health');
}

describe('Player opponent targeting', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    yDoc = new Y.Doc();
    player = new Player('local-player', yDoc, [], { initialHealth: 40 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('modifyHealth debounced logging', () => {
    it('logs a single debounced entry after rapid presses on one opponent', () => {
      player.modifyHealth(-1, 'opponent-a');
      player.modifyHealth(-1, 'opponent-a');
      player.modifyHealth(-1, 'opponent-a');

      vi.advanceTimersByTime(500);

      const entries = healthEntries(yDoc);
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toContain('37');
    });

    it("does not let interleaved presses on a second opponent clobber the first opponent's pending entry", () => {
      setPlayerName(yDoc, 'opponent-a', 'Alice');
      setPlayerName(yDoc, 'opponent-b', 'Bob');

      // Interleave presses on two different opponents within the same debounce window.
      player.modifyHealth(-1, 'opponent-a');
      player.modifyHealth(-1, 'opponent-b');
      player.modifyHealth(-1, 'opponent-a');
      player.modifyHealth(-1, 'opponent-b');

      vi.advanceTimersByTime(500);

      const entries = healthEntries(yDoc);

      // Each opponent must get its own logged entry — a shared timer/key would
      // have let opponent-b's presses clear opponent-a's pending timeout (and
      // vice versa), silently dropping one of the two log entries.
      expect(entries).toHaveLength(2);

      const aliceEntry = entries.find((e) => e.text.includes('Alice'));
      const bobEntry = entries.find((e) => e.text.includes('Bob'));
      expect(aliceEntry?.text).toContain('38');
      expect(bobEntry?.text).toContain('38');
    });

    it('only logs the final health value when presses on the same opponent collapse', () => {
      player.modifyHealth(-1, 'opponent-a'); // 39
      vi.advanceTimersByTime(250);
      player.modifyHealth(-1, 'opponent-a'); // 38, resets the timer
      vi.advanceTimersByTime(250);
      // Original 500ms timer would have fired by now if not reset by the second call.
      expect(healthEntries(yDoc)).toHaveLength(0);

      vi.advanceTimersByTime(250);
      const entries = healthEntries(yDoc);
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toContain('38');
    });

    it("does not let an opponent health change clobber the local player's own pending entry", () => {
      player.modifyHealth(-1); // self
      player.modifyHealth(-1, 'opponent-a');
      vi.advanceTimersByTime(500);

      expect(healthEntries(yDoc)).toHaveLength(2);
    });
  });

  describe('addCustomCounter / modifyCustomCounter / removeCustomCounter targeting an opponent', () => {
    it('adds a counter with the given title/icon starting at 0', () => {
      player.addCustomCounter('Poison', '☠️', 'opponent-a');

      const counters = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
      expect(counters).toHaveLength(1);
      expect(counters[0]).toMatchObject({ title: 'Poison', icon: '☠️', value: 0 });
    });

    it('modifies the matching counter by delta, leaving others untouched, and logs a debounced entry', () => {
      player.addCustomCounter('Poison', '☠️', 'opponent-a');
      player.addCustomCounter('Energy', '⚡', 'opponent-a');
      const [poison, energy] = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];

      player.modifyCustomCounter(poison.id, 3, 'opponent-a');
      vi.advanceTimersByTime(500);

      const counters = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
      expect(counters.find((c) => c.id === poison.id)!.value).toBe(3);
      expect(counters.find((c) => c.id === energy.id)!.value).toBe(0);

      const entries = getActionLog(yDoc).toArray().filter((e) => e.type === 'counter');
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toContain('Poison from 0 to 3');
    });

    it('removes the matching counter only', () => {
      player.addCustomCounter('Poison', '☠️', 'opponent-a');
      player.addCustomCounter('Energy', '⚡', 'opponent-a');
      const [poison, energy] = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];

      player.removeCustomCounter(poison.id, 'opponent-a');

      const counters = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
      expect(counters.map((c) => c.id)).toEqual([energy.id]);
    });

    it('keeps counters scoped to the target opponent', () => {
      player.addCustomCounter('Poison', '☠️', 'opponent-a');
      player.addCustomCounter('Energy', '⚡', 'opponent-b');

      const aCounters = yDoc.getMap(YDOC_PLAYER('opponent-a')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
      const bCounters = yDoc.getMap(YDOC_PLAYER('opponent-b')).get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[];
      expect(aCounters).toHaveLength(1);
      expect(bCounters).toHaveLength(1);
      expect(aCounters[0].title).toBe('Poison');
      expect(bCounters[0].title).toBe('Energy');
    });
  });
});
