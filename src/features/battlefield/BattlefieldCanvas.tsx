import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node,
  useReactFlow,
  type OnNodeDrag,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import '@xyflow/react/dist/style.css';
import * as Y from 'yjs';
import posthog from 'posthog-js';

import { CardNode } from './nodes/CardNode';
import { TokenNode } from './nodes/TokenNode';
import { PlaymatNode } from './nodes/PlaymatNode';
import { HealthNode } from './nodes/HealthNode';
import { PileNode } from './nodes/PileNode';
import { useBattlefieldNodes } from './useBattlefieldNodes';
import { usePlaymatNodes } from './usePlaymatNodes';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { attachedTokens, findParentCard } from './cardTokenAttachment';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS, CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { MIN_ZOOM, MAX_ZOOM, MAT_WIDTH, MAT_HEIGHT } from './boardWorld';
import { TOKEN_SIZE } from './nodes/TokenNode';
import type { Player } from '@/features/player';
import type { TokenService } from '@/infrastructure/cards';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

const nodeTypes = {
  card: CardNode,
  token: TokenNode,
  playmat: PlaymatNode,
  health: HealthNode,
  pile: PileNode,
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

interface PileDropTarget {
  pileType: 'hand' | 'exile' | 'discard' | 'deck';
  /** ownerId from data-pile-owner, or null for dock elements (treated as local player's). */
  ownerId: string | null;
}

function findPileType(element: Element | null): PileDropTarget | null {
  let current = element as HTMLElement | null;
  while (current) {
    // Board PileNode: sets data-pile-type and data-pile-owner
    const pt = current.dataset?.pileType;
    if (pt === 'exile' || pt === 'discard' || pt === 'deck' || pt === 'hand') {
      return { pileType: pt, ownerId: current.dataset?.pileOwner ?? null };
    }
    // Dock hand elements (legacy; kept while the dock still exists in Phase 1)
    if (current.classList.contains('hand-container') || current.classList.contains('hand-cards')) {
      return { pileType: 'hand', ownerId: null };
    }
    current = current.parentElement;
  }
  return null;
}

function BattlefieldCanvasInner({ yDoc, localPlayerId, player, tokenService }: BattlefieldCanvasProps) {
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);

  const { nodes: cardTokenNodes, onNodesChange, elevateNode, elevateNodes, translateNodes } = useBattlefieldNodes(yCards, yTokens, localPlayerId);
  const { nodes: playmatNodes, localMatOrigin } = usePlaymatNodes(yDoc, localPlayerId);
  const { screenToFlowPosition, fitBounds } = useReactFlow();
  const { setNodeRef: setBattlefieldRef } = useDroppable({ id: 'battlefield' });

  // Expose screenToFlowPosition so dnd-kit's onDragEnd handler in App can convert
  // the drop pointer position to ReactFlow canvas coordinates.
  useEffect(() => {
    useGameInstance.getState().setScreenToFlowPosition(screenToFlowPosition);
  }, [screenToFlowPosition]);

  // Hold Alt to snap dragged cards/tokens to a sub-card grid.
  const [snapActive, setSnapActive] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Alt') setSnapActive(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setSnapActive(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // Center the camera on the local player's mat, and keep following it while the
  // seating settles during initial peer sync. When a player first loads in, only
  // their own player map exists, so they're seat 0; once peers sync in (with
  // earlier joinedAt), their seat index shifts and their mat moves. Re-centering
  // on each localMatOrigin change keeps the camera on the local mat instead of
  // leaving it parked on what becomes the first player's board. We stop the
  // moment the user manually pans/zooms so we never yank the viewport.
  const hasUserMovedRef = useRef(false);
  const lastCenteredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasUserMovedRef.current || !localMatOrigin) return;
    const key = `${localMatOrigin.x},${localMatOrigin.y}`;
    if (lastCenteredKeyRef.current === key) return;
    fitBounds(
      { x: localMatOrigin.x, y: localMatOrigin.y, width: MAT_WIDTH, height: MAT_HEIGHT },
      { padding: 0.15, duration: 0 },
    );
    lastCenteredKeyRef.current = key;
  }, [localMatOrigin, fitBounds]);

  // Track the latest localMatOrigin in a ref so the visibilitychange handler
  // can read it without being recreated on every localMatOrigin change.
  const localMatOriginRef = useRef(localMatOrigin);
  useEffect(() => { localMatOriginRef.current = localMatOrigin; }, [localMatOrigin]);

  // Re-center when the tab becomes visible. On mobile, the browser chrome
  // (address bar) animates during tab switches and resizes the ReactFlow
  // container without triggering onMoveStart — so the mat can drift off-screen.
  // Only recover if the user hasn't manually panned (hasUserMovedRef still false).
  useEffect(() => {
    const onVisibilityChange = () => {
      const origin = localMatOriginRef.current;
      if (document.hidden || hasUserMovedRef.current || !origin) return;
      fitBounds(
        { x: origin.x, y: origin.y, width: MAT_WIDTH, height: MAT_HEIGHT },
        { padding: 0.15, duration: 0 },
      );
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fitBounds]);

  // Maps node id → elevated zIndex assigned at drag-start, consumed at drag-stop.
  const dragElevationRef = useRef<Map<string, number>>(new Map());
  // Maps token id → pixel offset from its card's top-left corner, captured at
  // drag-start. Used to carry attached tokens along during a card drag.
  const attachOffsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  // True while a multi-selection drag is in flight; prevents onNodeDragStop from
  // double-writing the primary node (onSelectionDragStop handles all nodes instead).
  const isMultiDragRef = useRef(false);

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      useHotkeyMenuStore.getState().close();
      const newZ = getMaxZIndex(yCards, yTokens) + 1;
      dragElevationRef.current.set(node.id, newZ);
      elevateNode(node.id, newZ);

      // When a card starts moving, capture the offset of each attached token so
      // we can translate them in real time during the drag (onNodeDrag).
      if (node.type === 'card') {
        const tokens = attachedTokens(node.id, yTokens);
        if (tokens.length > 0) {
          const zElevations = new Map<string, number>();
          tokens.forEach((token, i) => {
            // Store offset from card origin so we can recompute absolute position
            // purely from the card's drag position (no accumulated drift).
            attachOffsetsRef.current.set(token.id, {
              dx: token.x - node.position.x,
              dy: token.y - node.position.y,
            });
            // Each attached token is elevated just above its card. Tokens added
            // later get progressively higher z so they don't interleave.
            const tokenZ = newZ + i + 1;
            dragElevationRef.current.set(token.id, tokenZ);
            zElevations.set(token.id, tokenZ);
          });
          elevateNodes(zElevations);
        }
      }
    },
    [yCards, yTokens, elevateNode, elevateNodes],
  );

  // Move attached tokens in real time as a card is dragged. This is local-state
  // only — Yjs writes happen once, on drag-stop, to avoid flooding peers.
  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      if (node.type !== 'card' || attachOffsetsRef.current.size === 0) return;
      const positions = new Map<string, { x: number; y: number }>();
      attachOffsetsRef.current.forEach((offset, tokenId) => {
        positions.set(tokenId, {
          x: node.position.x + offset.dx,
          y: node.position.y + offset.dy,
        });
      });
      translateNodes(positions);
    },
    [translateNodes],
  );

  const onSelectionDragStart = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      isMultiDragRef.current = true;
      useHotkeyMenuStore.getState().close();
      const baseZ = getMaxZIndex(yCards, yTokens);
      nodes.forEach((node, i) => {
        const newZ = baseZ + i + 1;
        dragElevationRef.current.set(node.id, newZ);
        elevateNode(node.id, newZ);
      });
    },
    [yCards, yTokens, elevateNode],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (event, node) => {
      // Multi-selection drag: onSelectionDragStop handles all writes, skip here.
      if (isMultiDragRef.current) return;

      const clientX = 'clientX' in event ? event.clientX : event.touches?.[0]?.clientX ?? 0;
      const clientY = 'clientY' in event ? event.clientY : event.touches?.[0]?.clientY ?? 0;

      // Check if released over a pile → move card off board (own piles only).
      // Use elementsFromPoint (plural) because the dragged card node has pointer-events: all
      // and sits on top of the pile at the drop location, so elementFromPoint returns the card,
      // not the pile. Iterating the full z-ordered list finds the pile underneath.
      if (node.type === 'card') {
        let pileTarget: PileDropTarget | null = null;
        for (const el of document.elementsFromPoint(clientX, clientY)) {
          pileTarget = findPileType(el);
          if (pileTarget) break;
        }
        if (pileTarget) {
          const { pileType, ownerId } = pileTarget;
          // ownerId === null → dock pile → local player's pile
          if (ownerId === null || ownerId === localPlayerId) {
            useGameInstance.getState().moveCardFromBattlefield(node.id, pileType);
            dragElevationRef.current.delete(node.id);
            return; // card moved off board; don't write position
          }
          // Dropped on an opponent's pile — reject silently; fall through to write position
        }
      }

      // Write final drag position + elevated zIndex to Yjs
      const elevatedZ = dragElevationRef.current.get(node.id);
      dragElevationRef.current.delete(node.id);

      if (node.type === 'card') {
        const card = yCards.get(node.id);
        if (card) yCards.set(node.id, { ...card, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? card.zIndex });
      } else if (node.type === 'token') {
        const token = yTokens.get(node.id);
        if (token) yTokens.set(node.id, { ...token, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? token.zIndex });
      }
    },
    [yCards, yTokens, localPlayerId],
  );

  const onSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      isMultiDragRef.current = false;
      nodes.forEach((node) => {
        const elevatedZ = dragElevationRef.current.get(node.id);
        dragElevationRef.current.delete(node.id);
        if (node.type === 'card') {
          const card = yCards.get(node.id);
          if (card) yCards.set(node.id, { ...card, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? card.zIndex });
        } else if (node.type === 'token') {
          const token = yTokens.get(node.id);
          if (token) yTokens.set(node.id, { ...token, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? token.zIndex });
        }
      });
    },
    [yCards, yTokens],
  );

  // Only token-template drops remain here — hand cards use dnd-kit (see App.tsx onDragEnd).
  const onDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('text/x-keyword-token-template')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    const tokenTemplateData = event.dataTransfer.getData('text/x-keyword-token-template');
    if (!tokenTemplateData) return;
    event.preventDefault();

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
  }, [screenToFlowPosition, yCards, yTokens, localPlayerId]);

  // Playmat nodes first (lowest z-order by zIndex, not array position)
  const allNodes: Node[] = [...playmatNodes, ...cardTokenNodes];

  return (
    <div ref={setBattlefieldRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={allNodes}
        edges={[]}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDragStop={onSelectionDragStop}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={() => useHotkeyMenuStore.getState().close()}
        onMoveStart={(event) => {
          useHotkeyMenuStore.getState().close();

          // event is null for programmatic moves (our fitBounds), non-null for
          // a real user pan/zoom — only the latter stops board auto-centering
          // see: lastCenteredKeyRef for location of auto-centering on load
          if (event) hasUserMovedRef.current = true;
        }}
        snapToGrid={snapActive}
        snapGrid={[Math.round(CARD_WIDTH / 4), Math.round(CARD_HEIGHT / 5)]}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        deleteKeyCode={null}
        panOnScroll={false}
        panOnDrag={true}
        zoomOnDoubleClick={false}
        style={{ background: '#1a1a1a' }}
      >
        <Background color="#2d2d2d" gap={40} />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function BattlefieldCanvas(props: BattlefieldCanvasProps) {
  return (
    <ReactFlowProvider>
      <BattlefieldCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
