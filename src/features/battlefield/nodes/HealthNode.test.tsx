import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { HealthNode } from './HealthNode';
import { renderNode } from '@/test/nodeHarness';
import { YDOC_PLAYER, YSTATE_HEALTH } from '@/constants';

const LOCAL_PLAYER = 'p1';
const OPPONENT = 'p2';

/**
 * HealthNode is a thin routing wrapper: local mutations go through the seeded
 * Player (covered by Player.test.ts), opponent mutations go through
 * opponentPlayerMutations (covered by opponentPlayerMutations.test.ts). These
 * tests only confirm the wiring — the right path is taken for the right
 * variant, verified through real Player/Yjs state, not internal calls.
 */
describe('HealthNode — local player', () => {
  it('increasing/decreasing health calls through to the seeded Player', async () => {
    const user = userEvent.setup();
    const { player } = renderNode(
      HealthNode,
      { ownerId: LOCAL_PLAYER, isLocal: true, name: 'Alice', health: 40, customCounters: [], yDoc: new Y.Doc() },
      { playerId: LOCAL_PLAYER },
    );

    await user.click(screen.getByRole('button', { name: 'Increase health' }));
    expect(player.getState().health).toBe(41);

    await user.click(screen.getByRole('button', { name: 'Decrease health' }));
    expect(player.getState().health).toBe(40);
  });

  it('renaming commits through Player.setName', async () => {
    const user = userEvent.setup();
    const { player } = renderNode(
      HealthNode,
      { ownerId: LOCAL_PLAYER, isLocal: true, name: 'Alice', health: 40, customCounters: [], yDoc: new Y.Doc() },
      { playerId: LOCAL_PLAYER },
    );

    const nameInput = screen.getByTitle('Click to rename');
    await user.clear(nameInput);
    await user.type(nameInput, 'Bob');
    await user.tab();

    expect(player.getName()).toBe('Bob');
  });
});

describe('HealthNode — opponent', () => {
  it('increasing/decreasing health writes to the opponent Yjs map, leaving the local player untouched', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    const { player } = renderNode(
      HealthNode,
      { ownerId: OPPONENT, isLocal: false, name: 'Opponent', health: 40, customCounters: [], yDoc },
      { playerId: LOCAL_PLAYER },
    );

    await user.click(screen.getByRole('button', { name: 'Increase health' }));

    expect(yDoc.getMap(YDOC_PLAYER(OPPONENT)).get(YSTATE_HEALTH)).toBe(41);
    expect(player.getState().health).toBe(40);
  });

  it('has no rename affordance', () => {
    renderNode(
      HealthNode,
      { ownerId: OPPONENT, isLocal: false, name: 'Opponent', health: 40, customCounters: [], yDoc: new Y.Doc() },
      { playerId: LOCAL_PLAYER },
    );

    expect(screen.queryByTitle('Click to rename')).not.toBeInTheDocument();
    expect(screen.getByText('Opponent')).toBeInTheDocument();
  });
});
