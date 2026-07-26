import { describe, it, expect } from 'vitest';
import { parseSnapshot } from './parseSnapshot';
import { exportSession } from './exportSession';
import { SESSION_SCHEMA_VERSION, emptyZones } from './sessionSnapshot';
import { seedGame } from '@/test/seedGame';
import { makeCard, makeCards } from '@/test/factories';

const validSeat = {
  seatId: 'alice',
  name: 'Alice',
  color: '#ff0000',
  joinedAt: 1,
  health: 40,
  customCounters: [],
  deckRevealCount: 0,
  allowViewHand: false,
  zones: emptyZones(),
};

const serialize = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: 1_700_000_000_000,
    roomName: 'mtg-original',
    seats: [validSeat],
    board: [],
    tokens: [],
    actionLog: [],
    ...overrides,
  });

describe('parseSnapshot', () => {
  it('accepts a file this app exported', () => {
    const { yDoc } = seedGame({ playerId: 'alice', deck: makeCards(3), hand: [makeCard()] });

    const result = parseSnapshot(JSON.stringify(exportSession(yDoc, 'mtg-x')));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.seats[0].zones.deck).toHaveLength(3);
      expect(result.snapshot.seats[0].zones.hand).toHaveLength(1);
    }
  });

  it('rejects a file that is not JSON', () => {
    const result = parseSnapshot('this is my grocery list');

    expect(result).toEqual({ ok: false, error: expect.stringContaining("isn't a saved Aura game") });
  });

  it('rejects JSON that is not a saved game', () => {
    expect(parseSnapshot('[1,2,3]').ok).toBe(false);
    expect(parseSnapshot('{"deck":"my deck"}').ok).toBe(false);
  });

  it('refuses a file from a newer version rather than partly applying it', () => {
    // A newer file may carry state this build drops on the floor, and the player
    // would not find out until something was already missing from their game.
    const result = parseSnapshot(serialize({ schemaVersion: SESSION_SCHEMA_VERSION + 1 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version');
  });

  it('accepts a file from an older schema version', () => {
    expect(parseSnapshot(serialize({ schemaVersion: SESSION_SCHEMA_VERSION - 1 })).ok).toBe(true);
  });

  it('rejects a saved game with no players', () => {
    const result = parseSnapshot(serialize({ seats: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no players');
  });

  it('treats a zone missing from an older file as empty, not as damage', () => {
    const seat = { ...validSeat, zones: { deck: [], hand: [] } };

    const result = parseSnapshot(serialize({ seats: [seat] }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.seats[0].zones.sideboard).toEqual([]);
  });

  it('drops cards with no id rather than importing something unaddressable', () => {
    const seat = {
      ...validSeat,
      zones: { ...emptyZones(), hand: [{ id: 'card-1', name: 'Sol Ring', cardNumber: 1 }, { name: 'Nameless' }] },
    };

    const result = parseSnapshot(serialize({ seats: [seat] }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.seats[0].zones.hand.map((c) => c.id)).toEqual(['card-1']);
  });

  it('keeps a card whose name is missing — the id is what makes it addressable', () => {
    const seat = {
      ...validSeat,
      zones: { ...emptyZones(), hand: [{ id: 'card-1', cardNumber: 1 }] },
    };

    const result = parseSnapshot(serialize({ seats: [seat] }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.seats[0].zones.hand[0].name).toBe('');
  });

  it('substitutes defaults for missing seat state instead of refusing the file', () => {
    const result = parseSnapshot(serialize({ seats: [{ seatId: 'alice' }] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.seats[0].health).toBe(40);
      expect(result.snapshot.seats[0].zones.deck).toEqual([]);
    }
  });
});
