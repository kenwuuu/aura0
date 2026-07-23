import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Node, NodeChange, applyNodeChanges } from '@xyflow/react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { WhiteboardCard } from './types';
import type { BattlefieldAwareness } from './awareness';
import { easePoint } from './peerMotion';
import { KeywordToken } from '@/features/keyword-tokens/types';

export interface DragNodeState {
  id: string;
  x: number;
  y: number;
  zIndex: number;
}

function sameDragNodes(a: Map<string, DragNodeState>, b: Map<string, DragNodeState>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, node] of a) {
    const other = b.get(id);
    if (!other || other.x !== node.x || other.y !== node.y || other.zIndex !== node.zIndex) return false;
  }
  return true;
}

function buildNodes(
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  localPlayerId: string,
): Node[] {
  const nodes: Node[] = [];

  yCards.forEach((card) => {
    const isLocal = card.ownerId === localPlayerId;
    nodes.push({
      id: card.id,
      type: 'card',
      position: { x: card.x, y: card.y },
      data: { ...card, yCards, yTokens, localPlayerId },
      zIndex: card.zIndex,
      draggable: true,
      selectable: isLocal,
    });
  });

  yTokens.forEach((token) => {
    const isLocal = token.ownerId === localPlayerId;
    nodes.push({
      id: token.id,
      type: 'token',
      position: { x: token.x, y: token.y },
      data: { ...token, yTokens, localPlayerId },
      zIndex: token.zIndex,
      draggable: true,
      selectable: isLocal,
    });
  });

  return nodes;
}

export function useBattlefieldNodes(
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  localPlayerId: string,
  awareness: Awareness | null,
) {
  const [nodes, setNodes] = useState<Node[]>(() =>
    buildNodes(yCards, yTokens, localPlayerId)
  );
  const [peerDragOverrides, setPeerDragOverrides] = useState<Map<string, DragNodeState>>(new Map);

  // Ids of nodes the local user is actively dragging. While a drag is in flight
  // we stream positions to peers via awareness and don't write Yjs until drag-stop,
  // so the dragged node's Yjs position is stale. A peer's concurrent Yjs write
  // (drawing, playing, finishing their own drag) triggers a full observer rebuild
  // that would reset our mid-drag node to that stale position and fight react-flow's
  // d3-drag. We track these ids so the sync preserves their live local positions.
  const draggingIdsRef = useRef<Set<string>>(new Set());
  const setDraggingNodeIds = useCallback((ids: Set<string>) => {
    draggingIdsRef.current = ids;
  }, []);

  // Peer drag positions as streamed (targets) vs. as painted (shown). The ease
  // between them runs on `dragRafRef` and stops as soon as they converge, so an
  // idle board schedules no frames at all.
  const dragTargetsRef = useRef<Map<string, DragNodeState>>(new Map());
  const shownDragRef = useRef<Map<string, DragNodeState>>(new Map());
  const dragRafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    const sync = () => setNodes((prev) => {
      const next = buildNodes(yCards, yTokens, localPlayerId);
      // buildNodes carries no `selected` flag (react-flow holds selection in the
      // local `nodes` array via onNodesChange), so a naive replace would wipe the
      // user's multi-selection on every Yjs write — including a group drag's own
      // drag-stop commit. Carry `selected` forward so a selection only clears when
      // the user clicks empty board. Also keep local position/zIndex for nodes this
      // client is dragging so a peer's concurrent write doesn't fight react-flow's
      // in-flight drag.
      const localById = new Map(prev.map((n) => [n.id, n]));
      return next.map((n) => {
        const local = localById.get(n.id);
        if (!local) return n;
        const selected = local.selected ? { selected: true } : null;
        const dragging = draggingIdsRef.current.has(n.id)
          ? { position: local.position, zIndex: local.zIndex }
          : null;
        return selected || dragging ? { ...n, ...selected, ...dragging } : n;
      });
    });
    yCards.observe(sync);
    yTokens.observe(sync);
    sync();
    return () => {
      yCards.unobserve(sync);
      yTokens.unobserve(sync);
    };
  }, [yCards, yTokens, localPlayerId]);

  // Listen for peer drag positions broadcast via awareness and apply them as
  // position overrides so opponents see live card movement. The streamed
  // positions are targets, not what we paint: `step` eases toward them so a card
  // dragged by a peer glides instead of teleporting between arriving packets.
  useEffect(() => {
    if (!awareness) return;

    const step = (now: number) => {
      const dt = lastFrameRef.current === 0 ? 16.7 : now - lastFrameRef.current;
      lastFrameRef.current = now;

      const targets = dragTargetsRef.current;
      const shown = shownDragRef.current;
      const next = new Map<string, DragNodeState>();
      let animating = false;

      targets.forEach((target, id) => {
        const prev = shown.get(id);
        // First frame of a peer's drag: show it where they say it is. Easing in
        // from its pre-drag position would slide the card across the board.
        if (!prev) {
          next.set(id, target);
          return;
        }
        const eased = easePoint(prev, target, dt);
        if (!eased.settled) animating = true;
        next.set(id, { ...target, x: eased.point.x, y: eased.point.y });
      });

      // Drags that just ended: the peer cleared their awareness `drag` and
      // committed the final position to Yjs. Because the ease necessarily trails
      // the live stream, dropping the override outright here would jump the card
      // forward by exactly that lag — so keep easing it the last few pixels into
      // its committed position, then let go.
      shown.forEach((prev, id) => {
        if (targets.has(id)) return;
        const committed = yCards.get(id) ?? yTokens.get(id);
        if (!committed) return; // left the board mid-drag (e.g. dropped on a pile)
        const eased = easePoint(prev, committed, dt);
        if (eased.settled) return; // arrived: the Yjs position speaks for itself now
        animating = true;
        next.set(id, { id, x: eased.point.x, y: eased.point.y, zIndex: committed.zIndex });
      });

      shownDragRef.current = next;
      setPeerDragOverrides(next);

      if (animating) {
        dragRafRef.current = requestAnimationFrame(step);
      } else {
        dragRafRef.current = null;
        lastFrameRef.current = 0;
      }
    };

    const onChange = (_changes: unknown, origin: unknown) => {
      // Our own drag is already on screen via react-flow; re-deriving peer state
      // from it would re-render the board at pointer rate for nothing.
      if (origin === 'local') return;

      const targets = new Map<string, DragNodeState>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const drag = (state as BattlefieldAwareness).drag;
        drag?.nodes?.forEach((node) => targets.set(node.id, node));
      });

      // Awareness fires 'change' for *any* field, so a peer moving their cursor
      // lands here too. Without this, every cursor tick from every peer would
      // churn drag state and re-render the board.
      if (sameDragNodes(dragTargetsRef.current, targets)) return;
      dragTargetsRef.current = targets;

      if (dragRafRef.current === null) {
        lastFrameRef.current = 0;
        dragRafRef.current = requestAnimationFrame(step);
      }
    };

    awareness.on('change', onChange);
    return () => {
      awareness.off('change', onChange);
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    };
  }, [awareness, yCards, yTokens]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const elevateNodes = useCallback((updates: Map<string, number>) => {
    setNodes((prev) => prev.map((n) => {
      const newZ = updates.get(n.id);
      return newZ !== undefined ? { ...n, zIndex: newZ } : n;
    }));
  }, []);

  const translateNodes = useCallback((positions: Map<string, { x: number; y: number }>) => {
    setNodes((prev) => prev.map((n) => {
      const pos = positions.get(n.id);
      return pos !== undefined ? { ...n, position: pos } : n;
    }));
  }, []);

  // Merge peer drag overrides into the node list. Local drag always wins so
  // our own react-flow drag state is never clobbered by a peer moving the same node.
  const nodesWithPeerDrags = useMemo(() => {
    if (peerDragOverrides.size === 0) return nodes;
    return nodes.map((n) => {
      if (draggingIdsRef.current.has(n.id)) return n;
      const override = peerDragOverrides.get(n.id);
      return override
        ? { ...n, position: { x: override.x, y: override.y }, zIndex: override.zIndex }
        : n;
    });
  }, [nodes, peerDragOverrides]);

  return { nodes: nodesWithPeerDrags, onNodesChange, elevateNodes, translateNodes, setDraggingNodeIds };
}
