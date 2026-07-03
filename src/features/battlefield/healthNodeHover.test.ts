import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { applyHealthHoverElevation, HEALTH_HOVER_Z_INDEX } from './healthNodeHover';

function makeNodes(): Node[] {
  return [
    { id: 'health-p1', type: 'health', position: { x: 0, y: 0 }, data: {}, zIndex: 10 },
    { id: 'card-1', type: 'card', position: { x: 0, y: 0 }, data: {}, zIndex: 500 },
  ];
}

describe('applyHealthHoverElevation', () => {
  it('returns the same array reference when nothing is hovered', () => {
    const nodes = makeNodes();
    expect(applyHealthHoverElevation(nodes, null)).toBe(nodes);
  });

  it('elevates only the hovered health node above the highest card zIndex', () => {
    const nodes = makeNodes();
    const result = applyHealthHoverElevation(nodes, 'health-p1');

    const health = result.find((n) => n.id === 'health-p1');
    const card = result.find((n) => n.id === 'card-1');
    expect(health?.zIndex).toBe(HEALTH_HOVER_Z_INDEX);
    expect(health?.zIndex).toBeGreaterThan(card!.zIndex as number);
    expect(card).toBe(nodes[1]); // untouched node keeps its identity
  });

  it('leaves the node untouched when the hovered id does not match any node', () => {
    const nodes = makeNodes();
    const result = applyHealthHoverElevation(nodes, 'health-does-not-exist');
    expect(result.find((n) => n.id === 'health-p1')?.zIndex).toBe(10);
  });
});
