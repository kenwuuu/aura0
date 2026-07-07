import { BaseEdge, EdgeProps, getBezierPath, useInternalNode } from '@xyflow/react';
import { getFloatingEdgeParams } from './floatingEdgeGeometry';
import './attachmentEdge.css';

/** react-flow edge `type` string this component is registered under. */
export const ATTACHMENT_EDGE_TYPE = 'attachment';

/**
 * Base line/marker color. Single source of truth shared with the CSS variable in
 * attachmentEdge.css and the arrowhead marker in attachments.ts. Change here (or
 * override --attachment-edge-color in a theme) when the redesign lands.
 */
export const ATTACHMENT_EDGE_COLOR = '#b58cff';

/**
 * Floating attachment edge: anchors to the nearest border of each card and
 * re-aims live as either card moves. All stroke styling lives in CSS
 * (attachmentEdge.css) so this stays theme-agnostic ahead of the redesign.
 */
export function AttachmentEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Nodes not yet measured (first frame) — skip until react-flow reports size.
  if (!sourceNode || !targetNode) return null;
  const sm = sourceNode.measured;
  const tm = targetNode.measured;
  if (!sm?.width || !sm?.height || !tm?.width || !tm?.height) return null;

  const sourceRect = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    width: sm.width,
    height: sm.height,
  };
  const targetRect = {
    x: targetNode.internals.positionAbsolute.x,
    y: targetNode.internals.positionAbsolute.y,
    width: tm.width,
    height: tm.height,
  };

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceRect, targetRect);
  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
}
