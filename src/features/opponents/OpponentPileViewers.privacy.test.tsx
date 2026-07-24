import { describe, it, expect, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import type * as Y from 'yjs';
import { OpponentPileViewers } from './OpponentPileViewers';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { renderWithGame } from '@/test/harness';
import { makeCards } from '@/test/factories';
import { YDOC_PLAYER, YSTATE_HAND, YSTATE_EXILE_PILE, YSTATE_CAN_VIEW_HAND } from '@/constants';

/**
 * Privacy invariant: an opponent's client must not reveal your hand unless you
 * opted in (`canViewHand`), and there is no path at all to your deck. These are
 * honest-client guarantees — the P2P Yjs doc replicates every zone to every peer,
 * so a *modified* client can still read the raw bytes; what a test can lock down
 * is that the shipped client honors the flags.
 *
 * `pileNodeLogic.test.ts` / `PileNode.test.tsx` already prove the board node
 * won't *fire* an open request for a gated pile. This is the other half — the
 * consumer, `OpponentPileViewers`, re-checks the live `canViewHand` on the
 * opponent's Yjs map at open time, so even a request that reached it (a future
 * node-side bug, or one dispatched directly) still opens nothing.
 */

const OPPONENT = 'opp-1';
type OpponentPile = 'exile' | 'discard' | 'hand';

/** Renders OpponentPileViewers off the game store the harness seeds. */
function OppFromStore() {
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  if (!yDoc || !playerId) return null;
  return <OpponentPileViewers yDoc={yDoc} localPlayerId={playerId} />;
}

function mountWithOpponent(seed: (oppMap: Y.Map<any>) => void) {
  const game = renderWithGame(<OppFromStore />);
  const oppMap = game.yDoc.getMap(YDOC_PLAYER(OPPONENT));
  act(() => {
    seed(oppMap);
  });
  return { game, oppMap };
}

function requestOpponentPile(pile: OpponentPile) {
  act(() => {
    usePileViewerOpenStore.getState().open({ scope: 'opponent', playerId: OPPONENT, pile });
  });
}

beforeEach(() => {
  usePileViewerOpenStore.getState().clear();
});

describe('OpponentPileViewers — hand privacy', () => {
  it("does not open your hand for an opponent who hasn't been granted access", async () => {
    // The opponent HAS a hand in the shared doc, but never set canViewHand.
    mountWithOpponent((opp) => {
      opp.set(YSTATE_HAND, makeCards(4));
    });

    requestOpponentPile('hand');

    // No viewer, no cards — the request was refused at the consumer.
    expect(screen.queryByTestId('pile-viewer')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('pile-viewer-card')).toHaveLength(0);
  });

  it('treats an explicit canViewHand=false the same as never granting it', () => {
    mountWithOpponent((opp) => {
      opp.set(YSTATE_HAND, makeCards(4));
      opp.set(YSTATE_CAN_VIEW_HAND, false);
    });

    requestOpponentPile('hand');

    expect(screen.queryByTestId('pile-viewer')).not.toBeInTheDocument();
  });

  it('opens the hand only once the owner shares it', async () => {
    mountWithOpponent((opp) => {
      opp.set(YSTATE_HAND, makeCards(3));
      opp.set(YSTATE_CAN_VIEW_HAND, true);
    });

    requestOpponentPile('hand');

    const viewer = await screen.findByTestId('pile-viewer');
    expect(viewer).toHaveAttribute('data-pile-type', 'hand');
    expect(await screen.findAllByTestId('pile-viewer-card')).toHaveLength(3);
  });
});

describe('OpponentPileViewers — the gate is specific to the hand', () => {
  it('always opens a public pile (exile) — the block is the hand, not everything', async () => {
    mountWithOpponent((opp) => {
      opp.set(YSTATE_EXILE_PILE, makeCards(2));
      // Note: no canViewHand — a public zone needs no opt-in.
    });

    requestOpponentPile('exile');

    const viewer = await screen.findByTestId('pile-viewer');
    expect(viewer).toHaveAttribute('data-pile-type', 'exile');
    expect(await screen.findAllByTestId('pile-viewer-card')).toHaveLength(2);
  });
});
