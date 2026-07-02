import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { PileNode, type PileNodeData } from './PileNode';
import { renderNode } from '@/test/nodeHarness';
import { makeCard } from '@/test/factories';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import type { RenderNodeOptions } from '@/test/nodeHarness';

const LOCAL_PLAYER = 'p1';
const OPPONENT = 'p2';

function renderPile(
  overrides: Partial<PileNodeData>,
  gameOptions: RenderNodeOptions = {},
) {
  return renderNode(
    PileNode,
    {
      ownerId: LOCAL_PLAYER,
      isLocal: true,
      pileKind: 'deck',
      count: 0,
      allowViewHand: false,
      yDoc: new Y.Doc(),
      ...overrides,
    },
    { playerId: LOCAL_PLAYER, ...gameOptions },
  );
}

describe('PileNode — click routes to the right viewer', () => {
  it('opens the local viewer for a local exile pile', async () => {
    const user = userEvent.setup();
    renderPile({ pileKind: 'exile', count: 2 });

    await user.click(screen.getByText('Exile'));

    expect(usePileViewerOpenStore.getState().request).toEqual({ scope: 'local', pile: 'exile' });
  });

  it('does not open a viewer for the local hand pile', async () => {
    const user = userEvent.setup();
    renderPile({ pileKind: 'hand', isLocal: true, count: 5 });

    await user.click(screen.getByText('Hand'));

    expect(usePileViewerOpenStore.getState().request).toBeNull();
  });

  it("opens the opponent viewer for an opponent's discard pile", async () => {
    const user = userEvent.setup();
    renderPile({ ownerId: OPPONENT, isLocal: false, pileKind: 'discard', count: 3 });

    await user.click(screen.getByText('Discard'));

    expect(usePileViewerOpenStore.getState().request).toEqual({
      scope: 'opponent',
      playerId: OPPONENT,
      pile: 'discard',
    });
  });

  it("does not open a gated opponent's hand, and shows a lock", async () => {
    const user = userEvent.setup();
    renderPile({ ownerId: OPPONENT, isLocal: false, pileKind: 'hand', allowViewHand: false, count: 7 });

    expect(screen.getByText(/🔒/)).toBeInTheDocument();
    await user.click(screen.getByText(/^Hand/));

    expect(usePileViewerOpenStore.getState().request).toBeNull();
  });

  it("opens an opponent's hand once they allow viewing it", async () => {
    const user = userEvent.setup();
    renderPile({ ownerId: OPPONENT, isLocal: false, pileKind: 'hand', allowViewHand: true, count: 7 });

    await user.click(screen.getByText('Hand'));

    expect(usePileViewerOpenStore.getState().request).toEqual({
      scope: 'opponent',
      playerId: OPPONENT,
      pile: 'hand',
    });
  });
});

describe('PileNode — draw button', () => {
  it('draws a card from the local deck into the local hand', async () => {
    const user = userEvent.setup();
    renderPile(
      { pileKind: 'deck', isLocal: true, count: 1 },
      { deck: [makeCard({ name: 'Lightning Bolt' })] },
    );

    await user.click(screen.getByRole('button', { name: /draw/i }));

    const hand = useGameInstance.getState().player!.getHand().getCards();
    expect(hand.map((c) => c.name)).toContain('Lightning Bolt');
  });
});
