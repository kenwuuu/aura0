import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { getFloatingEdgeParams, nodeBorderIntersection, borderPosition } from './floatingEdgeGeometry';

const rect = (x: number, y: number) => ({ x, y, width: 100, height: 100 });

describe('nodeBorderIntersection', () => {
  it('exits the right border when the other node is directly to the right', () => {
    const point = nodeBorderIntersection(rect(0, 0), rect(400, 0));
    expect(point.x).toBeCloseTo(100); // right edge
    expect(point.y).toBeCloseTo(50); // vertically centered
  });

  it('exits the bottom border when the other node is directly below', () => {
    const point = nodeBorderIntersection(rect(0, 0), rect(0, 400));
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(100);
  });
});

describe('borderPosition', () => {
  it('classifies which side the intersection lies on', () => {
    const node = rect(0, 0);
    expect(borderPosition(node, { x: 100, y: 50 })).toBe(Position.Right);
    expect(borderPosition(node, { x: 0, y: 50 })).toBe(Position.Left);
    expect(borderPosition(node, { x: 50, y: 0 })).toBe(Position.Top);
    expect(borderPosition(node, { x: 50, y: 100 })).toBe(Position.Bottom);
  });
});

describe('getFloatingEdgeParams', () => {
  it('anchors both endpoints to the facing borders of horizontally separated nodes', () => {
    const params = getFloatingEdgeParams(rect(0, 0), rect(400, 0));
    expect(params.sx).toBeCloseTo(100); // source right edge
    expect(params.tx).toBeCloseTo(400); // target left edge
    expect(params.sourcePos).toBe(Position.Right);
    expect(params.targetPos).toBe(Position.Left);
  });
});
