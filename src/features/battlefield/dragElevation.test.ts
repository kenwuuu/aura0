import { describe, it, expect } from 'vitest';
import {
  computeGroupDragElevations,
  type DraggedNode,
  type AttachedChild,
} from './dragElevation';

// ── helpers ───────────────────────────────────────────────────────────────────

function node(id: string, zIndex: number, x = 0, y = 0): DraggedNode {
  return { id, zIndex, position: { x, y } };
}

/** A children lookup with no attachments — the common case. */
const noChildren = () => [];

describe('computeGroupDragElevations', () => {
  it('lifts the whole group above baseZ', () => {
    const dragged = [node('a', 3), node('b', 5), node('c', 8)];
    const baseZ = 20;

    const { zIndices } = computeGroupDragElevations(dragged, baseZ, new Set(), noChildren);

    for (const z of zIndices.values()) {
      expect(z).toBeGreaterThan(baseZ);
    }
  });

  it('preserves the group\'s internal stacking order regardless of input order', () => {
    // Passed in an order that is NOT z-order (this is what react-flow does).
    const dragged = [node('mid', 5), node('bottom', 1), node('top', 9)];

    const { zIndices } = computeGroupDragElevations(dragged, 100, new Set(), noChildren);

    // The card that was lowest before the drag stays lowest after it, etc.
    expect(zIndices.get('bottom')!).toBeLessThan(zIndices.get('mid')!);
    expect(zIndices.get('mid')!).toBeLessThan(zIndices.get('top')!);
  });

  it('keeps a stack contiguous — the relative gaps do not matter, only the order', () => {
    // A tight stack (consecutive z) dragged together with a far-away card.
    const dragged = [node('loner', 50), node('stackTop', 3), node('stackBottom', 2)];

    const { zIndices } = computeGroupDragElevations(dragged, 0, new Set(), noChildren);

    expect(zIndices.get('stackBottom')!).toBeLessThan(zIndices.get('stackTop')!);
    expect(zIndices.get('stackTop')!).toBeLessThan(zIndices.get('loner')!);
  });

  it('assigns a distinct z to every dragged node', () => {
    const dragged = [node('a', 1), node('b', 2), node('c', 3), node('d', 4)];

    const { zIndices } = computeGroupDragElevations(dragged, 0, new Set(), noChildren);

    const values = [...zIndices.values()];
    expect(new Set(values).size).toBe(values.length);
  });

  it('treats a single-node drag as a group of one', () => {
    const { zIndices } = computeGroupDragElevations([node('solo', 4)], 10, new Set(), noChildren);

    expect(zIndices.size).toBe(1);
    expect(zIndices.get('solo')!).toBeGreaterThan(10);
  });

  it('does not mutate the input array order', () => {
    const dragged = [node('mid', 5), node('bottom', 1), node('top', 9)];
    const snapshot = dragged.map((n) => n.id);

    computeGroupDragElevations(dragged, 0, new Set(), noChildren);

    expect(dragged.map((n) => n.id)).toEqual(snapshot);
  });

  it('defaults a missing zIndex to 0 for ordering', () => {
    const dragged: DraggedNode[] = [
      { id: 'a', position: { x: 0, y: 0 } }, // no zIndex → treated as 0
      node('b', 5),
    ];

    const { zIndices } = computeGroupDragElevations(dragged, 0, new Set(), noChildren);

    expect(zIndices.get('a')!).toBeLessThan(zIndices.get('b')!);
  });

  // ── carried children ────────────────────────────────────────────────────────

  it('slots a carried child directly above its parent and below the next parent', () => {
    const dragged = [node('cardLow', 1), node('cardHigh', 2)];
    const children: Record<string, AttachedChild[]> = {
      cardLow: [{ id: 'tokenOnLow', x: 0, y: 0 }],
    };
    const getChildren = (id: string) => children[id] ?? [];

    const { zIndices } = computeGroupDragElevations(dragged, 0, new Set(), getChildren);

    const low = zIndices.get('cardLow')!;
    const token = zIndices.get('tokenOnLow')!;
    const high = zIndices.get('cardHigh')!;
    expect(token).toBeGreaterThan(low); // above its own parent
    expect(token).toBeLessThan(high); // below the next parent
  });

  it('never collides two parents\' children in z', () => {
    // Both cards carry a token; the running counter must keep all four distinct.
    const dragged = [node('c1', 1), node('c2', 2)];
    const children: Record<string, AttachedChild[]> = {
      c1: [{ id: 't1', x: 0, y: 0 }],
      c2: [{ id: 't2', x: 0, y: 0 }],
    };
    const { zIndices } = computeGroupDragElevations(
      dragged,
      0,
      new Set(),
      (id) => children[id] ?? [],
    );

    const values = [...zIndices.values()];
    expect(new Set(values).size).toBe(values.length);
    // Each token stays above its own card and below the other card's stack.
    expect(zIndices.get('t1')!).toBeGreaterThan(zIndices.get('c1')!);
    expect(zIndices.get('t1')!).toBeLessThan(zIndices.get('c2')!);
    expect(zIndices.get('t2')!).toBeGreaterThan(zIndices.get('c2')!);
  });

  it('captures a carried child\'s offset from its parent origin', () => {
    const dragged = [node('card', 1, 100, 200)];
    const child: AttachedChild = { id: 'token', x: 130, y: 240 };

    const { childOffsets } = computeGroupDragElevations(
      dragged,
      0,
      new Set(),
      () => [child],
    );

    expect(childOffsets.get('token')).toEqual({ dx: 30, dy: 40 });
  });

  it('does not re-elevate a child that is itself in the drag set', () => {
    // The token is both selected (a dragged node) and attached to the card.
    const dragged = [node('card', 1), node('token', 5)];
    const { zIndices, childOffsets } = computeGroupDragElevations(
      dragged,
      0,
      new Set(['card', 'token']),
      (id) => (id === 'card' ? [{ id: 'token', x: 0, y: 0 }] : []),
    );

    // The token keeps its own drag-node elevation; it is not slotted as a child,
    // and gets no carry offset (it moves as its own selected node).
    expect(childOffsets.has('token')).toBe(false);
    // Ordering by original z still holds: card (1) below token (5).
    expect(zIndices.get('card')!).toBeLessThan(zIndices.get('token')!);
  });
});
