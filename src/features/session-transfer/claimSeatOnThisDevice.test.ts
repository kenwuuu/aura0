import { describe, it, expect } from 'vitest';
import { claimSeatOnThisDevice } from './claimSeatOnThisDevice';
import { getSeatAlias, resolvePlayerIdForRoom } from '@/infrastructure/networking';
import { readVisitedRooms } from '@/features/room/RoomManager';

describe('claimSeatOnThisDevice', () => {
  it('binds this device to the seat', () => {
    claimSeatOnThisDevice('mtg-restored', 'alice');

    expect(getSeatAlias('mtg-restored')).toBe('alice');
    expect(resolvePlayerIdForRoom('mtg-restored')).toBe('alice');
  });

  it('marks the room visited, so auto-load cannot reset the adopted seat', () => {
    // The half that is easy to forget: the room genuinely *is* new to this
    // browser — it is the game that isn't. Without this, autoLoadDeckOnStart
    // calls player.reset() and deals a fresh opening hand over the restored one.
    //
    // This bit the second player specifically, because the device that ran the
    // import is not the device that follows the link. Caught by
    // tests/e2e/app/session/seat_selection.spec.ts before it shipped.
    claimSeatOnThisDevice('mtg-restored', 'alice');

    expect(readVisitedRooms()).toContain('mtg-restored');
  });

  it('is scoped to the room being claimed', () => {
    claimSeatOnThisDevice('mtg-restored', 'alice');

    expect(getSeatAlias('mtg-other')).toBeNull();
    expect(readVisitedRooms()).not.toContain('mtg-other');
  });

  it('can be re-run for the same room without piling up visits', () => {
    claimSeatOnThisDevice('mtg-restored', 'alice');
    claimSeatOnThisDevice('mtg-restored', 'bob');

    expect(getSeatAlias('mtg-restored')).toBe('bob');
    expect(readVisitedRooms().filter((r) => r === 'mtg-restored')).toHaveLength(1);
  });
});
