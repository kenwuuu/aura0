import { useState, useEffect, useCallback } from 'react';
import { Node, NodeChange, applyNodeChanges } from '@xyflow/react';
import * as Y from 'yjs';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';

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
      draggable: isLocal,
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
      draggable: isLocal,
      selectable: isLocal,
    });
  });

  return nodes;
}

export function useBattlefieldNodes(
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  localPlayerId: string,
) {
  const [nodes, setNodes] = useState<Node[]>(() =>
    buildNodes(yCards, yTokens, localPlayerId)
  );

  useEffect(() => {
    const sync = () => setNodes(buildNodes(yCards, yTokens, localPlayerId));
    yCards.observe(sync);
    yTokens.observe(sync);
    sync();
    return () => {
      yCards.unobserve(sync);
      yTokens.unobserve(sync);
    };
  }, [yCards, yTokens, localPlayerId]);

  // Apply react-flow changes locally (smooth drag). Positions are written to
  // Yjs only on drag-stop (in BattlefieldCanvas.onNodeDragStop).
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  // Elevate multiple nodes at once in local state only.
  // Used when a card drag-start also needs to raise its attached tokens.
  const elevateNodes = useCallback((updates: Map<string, number>) => {
    setNodes((prev) => prev.map((n) => {
      const newZ = updates.get(n.id);
      return newZ !== undefined ? { ...n, zIndex: newZ } : n;
    }));
  }, []);

  // Move a set of nodes to new positions in local state only (no Yjs write).
  // Used during card drag to carry attached tokens along in real time.
  const translateNodes = useCallback((positions: Map<string, { x: number; y: number }>) => {
    setNodes((prev) => prev.map((n) => {
      const pos = positions.get(n.id);
      return pos !== undefined ? { ...n, position: pos } : n;
    }));
  }, []);

  return { nodes, onNodesChange, elevateNodes, translateNodes };
}
