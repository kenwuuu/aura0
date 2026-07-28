/**
 * Per-room seat identity — the indirection that lets a restored game keep the
 * seat ids it was exported with instead of rewriting every `ownerId` in the doc.
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePlayerIdForRoom,
  getSeatAlias,
  setSeatAlias,
  clearSeatAlias,
  getOrCreatePlayerId,
  clearPersistedSession,
} from './persistence';

describe('per-room seat identity', () => {
  it('resolves to this device\'s own player id when no seat is claimed', () => {
    const own = getOrCreatePlayerId();

    expect(resolvePlayerIdForRoom('mtg-fresh')).toBe(own);
  });

  it('resolves to the claimed seat id once a seat is claimed', () => {
    setSeatAlias('mtg-restored', 'player-alice');

    expect(resolvePlayerIdForRoom('mtg-restored')).toBe('player-alice');
  });

  it('scopes the claim to one room — other rooms are unaffected', () => {
    const own = getOrCreatePlayerId();
    setSeatAlias('mtg-restored', 'player-alice');

    expect(resolvePlayerIdForRoom('mtg-other')).toBe(own);
  });

  it('lets a device hold a different seat in each restored game', () => {
    setSeatAlias('mtg-game-one', 'player-alice');
    setSeatAlias('mtg-game-two', 'player-bob');

    expect(resolvePlayerIdForRoom('mtg-game-one')).toBe('player-alice');
    expect(resolvePlayerIdForRoom('mtg-game-two')).toBe('player-bob');
  });

  it('reports the claimed seat, and null before one is claimed', () => {
    expect(getSeatAlias('mtg-restored')).toBeNull();

    setSeatAlias('mtg-restored', 'player-alice');

    expect(getSeatAlias('mtg-restored')).toBe('player-alice');
  });

  it('falls back to the device id after the seat is released', () => {
    const own = getOrCreatePlayerId();
    setSeatAlias('mtg-restored', 'player-alice');

    clearSeatAlias('mtg-restored');

    expect(getSeatAlias('mtg-restored')).toBeNull();
    expect(resolvePlayerIdForRoom('mtg-restored')).toBe(own);
  });

  it('records "I joined as myself" without changing identity', () => {
    const own = getOrCreatePlayerId();

    // The picker writes this when the player chooses "join as a new player":
    // a no-op for identity, but it marks the room decided so it never re-asks.
    setSeatAlias('mtg-restored', own);

    expect(resolvePlayerIdForRoom('mtg-restored')).toBe(own);
    expect(getSeatAlias('mtg-restored')).not.toBeNull();
  });

  it('sweeps every seat alias when the session is cleared', () => {
    setSeatAlias('mtg-game-one', 'player-alice');
    setSeatAlias('mtg-game-two', 'player-bob');

    clearPersistedSession();

    // Leaving one behind would bind this browser to a seat id whose player id
    // was just thrown away.
    expect(getSeatAlias('mtg-game-one')).toBeNull();
    expect(getSeatAlias('mtg-game-two')).toBeNull();
  });

  it('leaves unrelated aura keys alone when sweeping', () => {
    localStorage.setItem('aura-visited-rooms', '["mtg-game-one"]');
    setSeatAlias('mtg-game-one', 'player-alice');

    clearPersistedSession();

    expect(localStorage.getItem('aura-visited-rooms')).toBe('["mtg-game-one"]');
  });
});
