/**
 * E2e for the join entry in the action log.
 *
 * The only thing unit tests can't prove about this: that the entry actually
 * reaches the panel through the real bootstrap wiring (Player construction →
 * shared Y.Array → ActionLogPanel). The fixture opens a fresh random room, so
 * the local player is always a first-time joiner there.
 */
import { test, expect } from '../fixtures';
import { floatingPanel } from '../harness';

test('a player entering a room is announced in the action log', async ({ page }) => {
  const log = floatingPanel(page, 'action-log');

  await expect(log.getByText('joined the game')).toBeVisible();
  // Exactly one player is in the room, so exactly one entrance is announced.
  await expect(log.getByText('joined the game')).toHaveCount(1);
});
