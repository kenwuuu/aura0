/**
 * Floating-edge geometry: compute where an edge should touch each node's border
 * so the line runs edge-to-edge and re-aims as either node moves. This is the
 * standard react-flow "floating edge" recipe, kept pure (no react-flow hooks) so
 * it can be unit-tested in isolation.
 */
import { Position } from '@xyflow/react';

interface NodeRect {
  x: number; // absolute top-left
  y: number;
  width: number;
  height: number;
}

/**
 * The point on `node`'s border that lies on the line toward `other`'s center.
 * Derived from the ellipse/rectangle intersection used by react-flow's example.
 */
export function nodeBorderIntersection(node: NodeRect, other: NodeRect): { x: number; y: number } {
  const w = node.width / 2;
  const h = node.height / 2;

  const cx = node.x + w;
  const cy = node.y + h;
  const ox = other.x + other.width / 2;
  const oy = other.y + other.height / 2;

  const dx = (ox - cx) / (2 * w) - (oy - cy) / (2 * h);
  const dy = (ox - cx) / (2 * w) + (oy - cy) / (2 * h);
  const scale = 1 / (Math.abs(dx) + Math.abs(dy) || 1);
  const sx = scale * dx;
  const sy = scale * dy;

  return {
    x: w * (sx + sy) + cx,
    y: h * (-sx + sy) + cy,
  };
}

/** Which side of `node` the intersection point sits on — used to orient the curve. */
export function borderPosition(node: NodeRect, point: { x: number; y: number }): Position {
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const nx = Math.round(node.x);
  const ny = Math.round(node.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + node.width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + node.height - 1) return Position.Bottom;
  return Position.Top;
}

export interface EdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

/** Border-to-border endpoints + curve orientation for an edge between two node rects. */
export function getFloatingEdgeParams(source: NodeRect, target: NodeRect): EdgeParams {
  const sourcePoint = nodeBorderIntersection(source, target);
  const targetPoint = nodeBorderIntersection(target, source);
  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos: borderPosition(source, sourcePoint),
    targetPos: borderPosition(target, targetPoint),
  };
}
