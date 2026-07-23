/**
 * Regression coverage for the multi-select deselect bug.
 *
 * react-flow holds node selection in the local `nodes` array, but the Yjs
 * observer rebuilds that array from `buildNodes` (which has no `selected` flag)
 * on every board write — including a group drag's own drag-stop commit. Before
 * the fix, any such write wiped the selection; `sync` now carries `selected`
 * forward so a group only clears when the user clicks empty board.
 *
 * The hook uses only React state + Yjs (no react-flow context), so it renders
 * without a ReactFlowProvider.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as Y from 'yjs';
import type { NodeChange } from '@xyflow/react';
import { useBattlefieldNodes } from './useBattlefieldNodes';
import type { WhiteboardCard } from './types';
import type { KeywordToken } from '@/features/keyword-tokens/types';

function makeCard(id: string, overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
  return {
    id,
    cardNumber: 1,
    name: 'Lightning Bolt',
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    zIndex: 1,
    ownerId: 'p1',
    ...overrides,
  };
}

function setup() {
  const yDoc = new Y.Doc();
  const yCards = yDoc.getMap<WhiteboardCard>('cards-on-board');
  const yTokens = yDoc.getMap<KeywordToken>('keyword-tokens');
  yCards.set('c1', makeCard('c1'));
  const hook = renderHook(() => useBattlefieldNodes(yCards, yTokens, 'p1', null));
  return { yDoc, yCards, yTokens, ...hook };
}

const selected = (nodes: { id: string; selected?: boolean }[], id: string) =>
  nodes.find((n) => n.id === id)?.selected;

describe('useBattlefieldNodes selection persistence', () => {
  it('keeps a selected card selected across a Yjs write', () => {
    const { yCards, result } = setup();

    act(() => {
      result.current.onNodesChange([{ id: 'c1', type: 'select', selected: true } as NodeChange]);
    });
    expect(selected(result.current.nodes, 'c1')).toBe(true);

    // A concurrent board write (a second card appears / a peer plays) rebuilds
    // the node list via the observer — the selection must survive it.
    act(() => {
      yCards.set('c2', makeCard('c2', { x: 20, y: 20, zIndex: 2 }));
    });
    expect(selected(result.current.nodes, 'c1')).toBe(true);
  });

  it('keeps a selected card selected when the card itself is mutated (drag-stop commit)', () => {
    const { yCards, result } = setup();

    act(() => {
      result.current.onNodesChange([{ id: 'c1', type: 'select', selected: true } as NodeChange]);
    });

    // Mirrors a drag-stop: the dragged (selected) card's position is committed
    // to Yjs, firing the observer that used to wipe the selection.
    act(() => {
      yCards.set('c1', makeCard('c1', { x: 99, y: 99 }));
    });

    expect(selected(result.current.nodes, 'c1')).toBe(true);
    expect(result.current.nodes.find((n) => n.id === 'c1')?.position).toEqual({ x: 99, y: 99 });
  });

  it('a card cleared via a deselect change stays cleared across a later write (click-away)', () => {
    const { yCards, result } = setup();

    act(() => {
      result.current.onNodesChange([{ id: 'c1', type: 'select', selected: true } as NodeChange]);
    });
    act(() => {
      result.current.onNodesChange([{ id: 'c1', type: 'select', selected: false } as NodeChange]);
    });

    act(() => {
      yCards.set('c2', makeCard('c2', { x: 20, y: 20, zIndex: 2 }));
    });

    expect(selected(result.current.nodes, 'c1')).toBeFalsy();
  });
});
