import React, { useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node,
  useReactFlow,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as Y from 'yjs';
import posthog from 'posthog-js';

import { CardNode } from './nodes/CardNode';
import { TokenNode } from './nodes/TokenNode';
import { useBattlefieldNodes } from './useBattlefieldNodes';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS, CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { MIN_ZOOM, MAX_ZOOM } from './boardWorld';
import { TOKEN_SIZE } from './nodes/TokenNode';
import type { Player } from '@/features/player';
import type { TokenService } from '@/infrastructure/cards';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

const nodeTypes = {
  card: CardNode,
  token: TokenNode,
};

interface BattlefieldCanvasProps {
  yDoc: Y.Doc;
  localPlayerId: string;
  player: Player;
  tokenService: TokenService;
}

function getMaxZIndex(yCards: Y.Map<WhiteboardCard>, yTokens: Y.Map<KeywordToken>): number {
  let max = 0;
  yCards.forEach((c) => { if (c.zIndex > max) max = c.zIndex; });
  yTokens.forEach((t) => { if (t.zIndex > max) max = t.zIndex; });
  return max;
}

function findPileType(element: Element | null): 'hand' | 'exile' | 'discard' | 'deck' | null {
  let current = element as HTMLElement | null;
  while (current) {
    const pt = current.dataset?.pileType;
    if (pt === 'exile' || pt === 'discard' || pt === 'deck') return pt;
    if (current.classList.contains('hand-container') || current.classList.contains('hand-cards')) {
      return 'hand';
    }
    current = current.parentElement;
  }
  return null;
}

function BattlefieldCanvasInner({ yDoc, localPlayerId, player, tokenService }: BattlefieldCanvasProps) {
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);

  const { nodes, onNodesChange } = useBattlefieldNodes(yCards, yTokens, localPlayerId);
  const { screenToFlowPosition } = useReactFlow();

  const onNodeDragStop: OnNodeDrag = useCallback(
    (event, node) => {
      const clientX = 'clientX' in event ? event.clientX : event.touches?.[0]?.clientX ?? 0;
      const clientY = 'clientY' in event ? event.clientY : event.touches?.[0]?.clientY ?? 0;

      // Check if released over a dock pile → move card off board
      if (node.type === 'card') {
        const under = document.elementFromPoint(clientX, clientY);
        const pileType = findPileType(under);
        if (pileType) {
          useGameInstance.getState().moveCardFromBattlefield(node.id, pileType);
          return;
        }
      }

      // Write final drag position to Yjs
      if (node.type === 'card') {
        const card = yCards.get(node.id);
        if (card) yCards.set(node.id, { ...card, x: node.position.x, y: node.position.y });
      } else if (node.type === 'token') {
        const token = yTokens.get(node.id);
        if (token) yTokens.set(node.id, { ...token, x: node.position.x, y: node.position.y });
      }
    },
    [yCards, yTokens],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const types = event.dataTransfer.types;
    event.dataTransfer.dropEffect = types.includes('text/x-keyword-token-template') ? 'copy' : 'move';
  }, []);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();

    // Keyword-token template drop (from the token grid)
    const tokenTemplateData = event.dataTransfer.getData('text/x-keyword-token-template');
    if (tokenTemplateData) {
      try {
        const template = JSON.parse(tokenTemplateData);
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const tokenId = `token-${Math.random().toString(36).substring(2, 11)}`;
        const maxZ = getMaxZIndex(yCards, yTokens);
        const newToken: KeywordToken = {
          id: tokenId,
          title: template.title,
          imageUrl: template.imageUrl ?? '',
          backgroundColor: template.backgroundColor,
          count: template.count,
          ownerId: localPlayerId,
          x: position.x - TOKEN_SIZE / 2,
          y: position.y - TOKEN_SIZE / 2,
          zIndex: maxZ + 1,
          rotation: 0,
        };
        yTokens.set(tokenId, newToken);
      } catch (err) {
        console.error('Failed to create token from template:', err);
      }
      return;
    }

    // Card drop from hand
    const cardId = event.dataTransfer.getData('text/plain');
    if (!cardId) return;

    const card = player.removeCardFromHand(cardId);
    if (!card) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const maxZ = getMaxZIndex(yCards, yTokens);

    const whiteboardCard: WhiteboardCard = {
      ...card,
      x: position.x - CARD_WIDTH / 2,
      y: position.y - CARD_HEIGHT / 2,
      zIndex: maxZ + 1,
      ownerId: localPlayerId,
    };

    yCards.set(card.id, whiteboardCard);

    posthog.capture('card_played_to_battlefield', {
      card_name: card.name,
      is_flipped: card.isFlipped,
    });

    // Create related MTG tokens (async, fire-and-forget)
    if (card.scryfallId) {
      tokenService
        .createTokensForCard(card.scryfallId, { x: whiteboardCard.x, y: whiteboardCard.y })
        .then((result) => {
          result.tokens.forEach((token) => {
            const maxZ2 = getMaxZIndex(yCards, yTokens);
            yCards.set(token.id, {
              ...token,
              x: token.x,
              y: token.y,
              zIndex: maxZ2 + 1,
              ownerId: localPlayerId,
            });
          });
          if (result.errors.length > 0) {
            console.warn(`Token creation errors for ${card.name}:`, result.errors);
          }
        })
        .catch(console.error);
    }
  }, [screenToFlowPosition, yCards, yTokens, player, tokenService, localPlayerId]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPaneClick={() => useHotkeyMenuStore.getState().close()}
      onMoveStart={() => useHotkeyMenuStore.getState().close()}
      onNodeDragStart={() => useHotkeyMenuStore.getState().close()}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panOnScroll={false}
      panOnDrag={true}
      style={{ background: '#1a1a1a' }}
    >
      <Background color="#2d2d2d" gap={40} />
      <Controls position="bottom-right" />
    </ReactFlow>
  );
}

export function BattlefieldCanvas(props: BattlefieldCanvasProps) {
  return (
    <ReactFlowProvider>
      <BattlefieldCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
