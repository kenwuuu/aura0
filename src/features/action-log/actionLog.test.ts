/**
 * Unit tests for the action log helpers.
 *
 * Uses real Y.Doc instances (not mocks) so the CRDT semantics are exercised
 * correctly — in particular the concurrent-append test validates the key
 * design decision (Y.Array vs. JS-array-in-Y.Map).
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { logAction, getActionLog } from './actionLog';
import { ACTION_LOG_MAX_ENTRIES } from '@/constants';

function makeDoc(): Y.Doc {
  return new Y.Doc();
}

describe('logAction', () => {
  it('appends a well-formed entry with id and ts', () => {
    const doc = makeDoc();
    logAction(doc, { actorId: 'player-abc', type: 'draw', text: 'drew a card' });

    const arr = getActionLog(doc);
    expect(arr.length).toBe(1);

    const entry = arr.get(0);
    expect(entry.actorId).toBe('player-abc');
    expect(entry.type).toBe('draw');
    expect(entry.text).toBe('drew a card');
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(typeof entry.ts).toBe('number');
    expect(entry.ts).toBeGreaterThan(0);
  });

  it('preserves insertion order across multiple appends', () => {
    const doc = makeDoc();
    logAction(doc, { actorId: 'p1', type: 'draw', text: 'drew a card' });
    logAction(doc, { actorId: 'p1', type: 'play_card', text: 'played Lightning Bolt' });
    logAction(doc, { actorId: 'p2', type: 'shuffle', text: 'shuffled their deck' });

    const arr = getActionLog(doc);
    expect(arr.length).toBe(3);
    expect(arr.get(0).type).toBe('draw');
    expect(arr.get(1).type).toBe('play_card');
    expect(arr.get(2).type).toBe('shuffle');

    const ids = arr.toArray().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('trims oldest entries when the soft cap is exceeded', () => {
    const doc = makeDoc();

    // Fill to exactly the cap
    for (let i = 0; i < ACTION_LOG_MAX_ENTRIES; i++) {
      logAction(doc, { actorId: 'p1', type: 'draw', text: `draw ${i}` });
    }
    expect(getActionLog(doc).length).toBe(ACTION_LOG_MAX_ENTRIES);

    // One more should trim the oldest
    logAction(doc, { actorId: 'p1', type: 'draw', text: 'final draw' });
    const arr = getActionLog(doc);
    expect(arr.length).toBe(ACTION_LOG_MAX_ENTRIES);
    // The oldest entry ("draw 0") should be gone; the newest should be last
    expect(arr.get(0).text).toBe('draw 1');
    expect(arr.get(arr.length - 1).text).toBe('final draw');
  });

  it('no lost entries when two peers append concurrently', () => {
    // This is the core correctness argument for Y.Array over a JS-array-in-Y.Map.
    // With a plain map pattern, concurrent writes would collide and one entry
    // would be silently dropped; Y.Array merges both without conflict.

    const docA = makeDoc();
    const docB = makeDoc();

    // Give both docs the same initial state (empty array, shared ID)
    const updateAtoB = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, updateAtoB);

    // Both peers append independently (simulating simultaneous actions)
    logAction(docA, { actorId: 'playerA', type: 'draw', text: 'drew a card' });
    logAction(docB, { actorId: 'playerB', type: 'play_card', text: 'played Counterspell' });

    // Sync both updates to each doc
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docB, updateA);

    // Both docs should have both entries — no lost messages
    const arrA = getActionLog(docA);
    const arrB = getActionLog(docB);
    expect(arrA.length).toBe(2);
    expect(arrB.length).toBe(2);

    const textsA = arrA.toArray().map((e) => e.text).sort();
    const textsB = arrB.toArray().map((e) => e.text).sort();
    expect(textsA).toEqual(['drew a card', 'played Counterspell']);
    expect(textsB).toEqual(textsA);
  });
});
