import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Node, NodeChange, applyNodeChanges } from '@xyflow/react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { WhiteboardCard } from './types';
import type { BattlefieldAwareness } from './awareness';
import { KeywordToken } from '@/features/keyword-tokens/types';

export interface DragNodeState {
  id: string;
  x: number;
  y: number;
  zIndex: number;
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

  useEffect(() => {
    const sync = () => setNodes((prev) => {
      const next = buildNodes(yCards, yTokens, localPlayerId);
      if (draggingIdsRef.current.size === 0) return next;
      // Keep the local position/zIndex for nodes this client is dragging so
      // a peer's concurrent Yjs write doesn't fight react-flow's in-flight drag.
      const localById = new Map(prev.map((n) => [n.id, n]));
      return next.map((n) => {
        if (!draggingIdsRef.current.has(n.id)) return n;
        const local = localById.get(n.id);
        return local ? { ...n, position: local.position, zIndex: local.zIndex } : n;
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
  // position overrides so opponents see live card movement.
  useEffect(() => {
    if (!awareness) return;
    const onChange = () => {
      const overrides = new Map<string, DragNodeState>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const drag = (state as BattlefieldAwareness).drag;
        drag?.nodes?.forEach((node) => overrides.set(node.id, node));
      });
      setPeerDragOverrides(overrides);
    };
    awareness.on('change', onChange);
    return () => awareness.off('change', onChange);
  }, [awareness]);

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
