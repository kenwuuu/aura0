import { describe, it, expect } from 'vitest';
import { renderWithGame } from './harness';
import { makeCard } from './factories';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';

/**
 * Smoke test for the test harness itself: renderWithGame seeds a real Y.Doc +
 * Player into the game/player stores, and setup.ts's afterEach resets them.
 */
describe('renderWithGame', () => {
  it('seeds a real Player, Y.Doc, and the game/player stores', () => {
    const { player, yDoc, playerId } = renderWithGame(<div>ok</div>, {
      hand: [makeCard({ name: 'Lightning Bolt' })],
      initialHealth: 40,
    });

    expect(useGameInstance.getState().yDoc).toBe(yDoc);
    expect(useGameInstance.getState().player).toBe(player);
    expect(useGameInstance.getState().playerId).toBe(playerId);
    expect(usePlayerStore.getState().yPlayerState).toBe(player.yPlayerState);

    const state = player.getState();
    expect(state.health).toBe(40);
    expect(state.hand.map((c) => c.name)).toEqual(['Lightning Bolt']);
  });

  it('starts from a clean store — the previous test did not leak', () => {
    // setup.ts's afterEach must have reset the singletons between tests.
    expect(useGameInstance.getState().player).toBeNull();
    expect(usePlayerStore.getState().yPlayerState).toBeNull();
  });
});
