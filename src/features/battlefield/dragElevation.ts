/** A node being dragged, as far as z-elevation is concerned. */
export interface DraggedNode {
  id: string;
  position: { x: number; y: number };
  zIndex?: number;
}

/** An attached child (a token) carried along by its parent during a drag. */
export interface AttachedChild {
  id: string;
  x: number;
  y: number;
}

export interface DragElevation {
  /** New zIndex for every dragged node and every carried (non-selected) child,
   *  keyed by node id. */
  zIndices: Map<string, number>;
  /** For each carried child, its pixel offset from its parent's origin at
   *  drag-start, so the child can be repositioned purely from the parent's
   *  live drag position (no accumulated drift). */
  childOffsets: Map<string, { dx: number; dy: number }>;
}

/**
 * Compute the z-indices that lift a drag group above the rest of the board
 * while preserving the group's own internal stacking order.
 *
 * react-flow gathers the selected nodes in array order — which is *not* z-order
 * — so assigning `baseZ + arrayIndex` reshuffles overlapping stacks on every
 * group drag (a face-down pile comes back interleaved). Sorting by the nodes'
 * current z first keeps each card at its relative height, so a stack stays a
 * stack and only rises as a whole.
 *
 * Carried children (attached tokens not themselves in the selection) are slotted
 * directly above their parent and below the next parent via a single running
 * counter, so a token never falls behind its card and two parents' children
 * never collide in z.
 */
export function computeGroupDragElevations(
  dragged: DraggedNode[],
  baseZ: number,
  draggedIds: ReadonlySet<string>,
  getAttachedChildren: (parentId: string) => AttachedChild[],
): DragElevation {
  const zIndices = new Map<string, number>();
  const childOffsets = new Map<string, { dx: number; dy: number }>();

  // Assign new z-indices in ascending order of the nodes' *current* z so the
  // group keeps its relative stacking instead of react-flow's gather order.
  const ordered = [...dragged].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  let z = baseZ;
  for (const node of ordered) {
    z += 1;
    zIndices.set(node.id, z);

    for (const child of getAttachedChildren(node.id)) {
      // A child already in the drag set keeps its own elevation; don't re-slot
      // it here as some parent's carried token.
      if (draggedIds.has(child.id)) continue;
      childOffsets.set(child.id, {
        dx: child.x - node.position.x,
        dy: child.y - node.position.y,
      });
      z += 1;
      zIndices.set(child.id, z);
    }
  }

  return { zIndices, childOffsets };
}
