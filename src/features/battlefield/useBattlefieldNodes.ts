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
    nodes.push({
      id: card.id,
      type: 'card',
      position: { x: card.x, y: card.y },
      data: { ...card, yCards, localPlayerId },
      zIndex: card.zIndex,
      draggable: card.ownerId === localPlayerId,
      selectable: false,
    });
  });

  yTokens.forEach((token) => {
    nodes.push({
      id: token.id,
      type: 'token',
      position: { x: token.x, y: token.y },
      data: { ...token, yTokens, localPlayerId },
      zIndex: token.zIndex,
      draggable: token.ownerId === localPlayerId,
      selectable: false,
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

  return { nodes, onNodesChange };
}
