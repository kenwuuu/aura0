import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  Node,
  ViewportPortal,
  useReactFlow,
  type OnNodeDrag,
  type NodeMouseHandler,
} from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import '@xyflow/react/dist/style.css';
import './reactFlowControls.css';
import * as Y from 'yjs';

import { CardNode } from './nodes/CardNode';
import { TokenNode } from './nodes/TokenNode';
import { PlaymatNode } from './nodes/PlaymatNode';
import { HealthNode } from './nodes/HealthNode';
import { PileNode } from './nodes/PileNode';
import { useBattlefieldNodes, type DragNodeState } from './useBattlefieldNodes';
import { usePeerCursors } from './usePeerCursors';
import { PeerCursor } from './nodes/PeerCursor';
import { AWARENESS_CURSOR } from './awareness';
import { usePlaymatNodes } from './usePlaymatNodes';
import { applyHealthHoverElevation } from './healthNodeHover';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { attachedChildren, findParent, nodeCenter, nodeContainsPoint } from './nodeAttachment';
import { findDropTarget, type PileDropTarget } from './dropTargetDetection';
import { spawnTokenAtPosition, getMaxZIndex } from './spawnToken';
import { moveCardFromBattlefield } from './battlefieldActions';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import { MIN_ZOOM, MAX_ZOOM, MAT_WIDTH, MAT_HEIGHT, BACKGROUND_GRID_GAP } from './boardWorld';
import type { Player } from '@/features/player';
import type { TokenService } from '@/infrastructure/cards';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { SettingsButton } from '@/features/settings/SettingsButton';

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

function finalizeCardDrag(
  node: Node,
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  elevatedZ: number | undefined,
  dragElevation: Map<string, number>,
  attachOffsets: Map<string, { dx: number; dy: number }>,
  skipTokenIds: Set<string> = new Set(),
): void {
  const card = yCards.get(node.id);
  if (card) yCards.set(node.id, { ...card, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? card.zIndex });
  attachedChildren(node.id, yTokens).forEach((token) => {
    if (skipTokenIds.has(token.id)) return;
    const offset = attachOffsets.get(token.id);
    const tokenZ = dragElevation.get(token.id);
    dragElevation.delete(token.id);
    yTokens.set(token.id, {
      ...token,
      x: offset ? node.position.x + offset.dx : token.x,
      y: offset ? node.position.y + offset.dy : token.y,
      zIndex: tokenZ ?? token.zIndex,
    });
  });
}

// Build the awareness drag payload for a node and its attached tokens.
// Position-only: no pile-drop, attach, or reparent logic runs here — those are
// decisions made at drag-stop. Attached children are carried by their captured
// offset so the whole cluster moves together on every frame.
function buildDragNodes(
  node: Node,
  elevatedZ: number | undefined,
  dragElevation: Map<string, number>,
  attachOffsets: Map<string, { dx: number; dy: number }>,
): DragNodeState[] {
  const dragNodes: DragNodeState[] = [
    { id: node.id, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? (node.zIndex as number ?? 0) },
  ];
  attachOffsets.forEach((offset, tokenId) => {
    dragNodes.push({
      id: tokenId,
      x: node.position.x + offset.dx,
      y: node.position.y + offset.dy,
      zIndex: dragElevation.get(tokenId) ?? 0,
    });
  });
  return dragNodes;
}

function finalizeTokenDrag(
  node: Node,
  yCards: Y.Map<WhiteboardCard>,
  yTokens: Y.Map<KeywordToken>,
  elevatedZ: number | undefined,
): void {
  const token = yTokens.get(node.id);
  if (!token) return;
  const newParentId = findParent({ x: node.position.x, y: node.position.y }, 'token', yCards, 'card');
  const parentCard = newParentId ? yCards.get(newParentId) : undefined;
  const finalZ = parentCard
    ? Math.max(elevatedZ ?? token.zIndex, parentCard.zIndex + 1)
    : (elevatedZ ?? token.zIndex);
  yTokens.set(node.id, { ...token, x: node.position.x, y: node.position.y, zIndex: finalZ, attachedTo: newParentId });
}

function BattlefieldCanvasInner({ yDoc, localPlayerId }: BattlefieldCanvasProps) {
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const awareness = useGameInstance((s) => s.awareness);

  const { nodes: cardTokenNodes, onNodesChange, elevateNodes, translateNodes, setDraggingNodeIds } = useBattlefieldNodes(yCards, yTokens, localPlayerId, awareness);
  const { nodes: playmatNodes, localMatOrigin } = usePlaymatNodes(yDoc, localPlayerId);
  const { screenToFlowPosition, fitBounds } = useReactFlow();
  const { setNodeRef: setBattlefieldRef } = useDroppable({ id: 'battlefield' });

  // Expose screenToFlowPosition so dnd-kit's onDragEnd handler in App can convert
  // the drop pointer position to ReactFlow canvas coordinates.
  useEffect(() => {
    useGameInstance.getState().setScreenToFlowPosition(screenToFlowPosition);
  }, [screenToFlowPosition]);

  const peers = usePeerCursors(awareness, yDoc);
  const rafRef = useRef<number | null>(null);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (rafRef.current !== null) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pos = screenToFlowPosition({ x: clientX, y: clientY });
      awareness?.setLocalStateField(AWARENESS_CURSOR, pos);
    });
  }, [awareness, screenToFlowPosition]);

  const onPointerLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    awareness?.setLocalStateField(AWARENESS_CURSOR, null);
  }, [awareness]);

  // Snap-to-grid is either always on (persisted setting) or held on with Alt.
  const snapToGridEnabled = useSettingsStore((s) => s.snapToGridEnabled);
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);
  const snapActive = snapToGridEnabled || altHeld;

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
      { x: localMatOrigin.x, y: localMatOrigin.y + MAT_HEIGHT * 0.25, width: MAT_WIDTH, height: MAT_HEIGHT },
      { padding: 0.65, duration: 0 },
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
      useContextMenuStore.getState().close();
      const newZ = getMaxZIndex(yCards, yTokens) + 1;
      dragElevationRef.current.set(node.id, newZ);

      // Build a single elevation map for the card and all its attached tokens,
      // then apply it in one setNodes call so the card never briefly appears
      // above its tokens between two separate state updates.
      const zElevations = new Map<string, number>();
      zElevations.set(node.id, newZ);

      // Any node type can have attached children — collect offsets and elevations for all.
      attachedChildren(node.id, yTokens).forEach((child, i) => {
        // Store offset from parent origin so we can recompute absolute position
        // purely from the parent's drag position (no accumulated drift).
        attachOffsetsRef.current.set(child.id, {
          dx: child.x - node.position.x,
          dy: child.y - node.position.y,
        });
        // Each child sits just above its parent. Multiple children get
        // progressively higher z so they don't interleave with each other.
        const childZ = newZ + i + 1;
        dragElevationRef.current.set(child.id, childZ);
        zElevations.set(child.id, childZ);
      });

      elevateNodes(zElevations);
      // The dragged node and its carried tokens are now locally controlled —
      // shield them from observer rebuilds triggered by a peer's concurrent Yjs
      // write, which would otherwise snap them to their stale pre-drag position.
      setDraggingNodeIds(new Set(zElevations.keys()));
    },
    [yCards, yTokens, elevateNodes, setDraggingNodeIds],
  );

  // Broadcast the dragged node (and its carried children) via awareness on every
  // frame so peers see live movement without touching the Yjs document. Final
  // positions are committed to Yjs only on drag-stop.
  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      // Selection drags are handled by onSelectionDrag; avoid double-broadcasting.
      if (isMultiDragRef.current) return;
      const elevatedZ = dragElevationRef.current.get(node.id);
      awareness?.setLocalStateField('drag', {
        nodes: buildDragNodes(node, elevatedZ, dragElevationRef.current, attachOffsetsRef.current),
      });

      if (attachOffsetsRef.current.size === 0) return;
      const positions = new Map<string, { x: number; y: number }>();
      attachOffsetsRef.current.forEach((offset, tokenId) => {
        positions.set(tokenId, {
          x: node.position.x + offset.dx,
          y: node.position.y + offset.dy,
        });
      });
      translateNodes(positions);
    },
    [awareness, translateNodes],
  );

  const onSelectionDragStart = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      isMultiDragRef.current = true;
      useContextMenuStore.getState().close();
      const baseZ = getMaxZIndex(yCards, yTokens);

      // Collect ids of tokens already in the selection so we don't assign them
      // a second elevation when processing their parent card's attached tokens.
      const selectedTokenIds = new Set(nodes.filter((n) => n.type === 'token').map((n) => n.id));

      // Build the full elevation map for all selected nodes + their implicitly
      // carried tokens, then apply in one setNodes call (avoids card-over-token flicker).
      const zElevations = new Map<string, number>();
      nodes.forEach((node, i) => {
        const newZ = baseZ + i + 1;
        dragElevationRef.current.set(node.id, newZ);
        zElevations.set(node.id, newZ);

        // Any node type can carry attached children.
        attachedChildren(node.id, yTokens).forEach((child, j) => {
          if (selectedTokenIds.has(child.id)) return;
          attachOffsetsRef.current.set(child.id, {
            dx: child.x - node.position.x,
            dy: child.y - node.position.y,
          });
          const childZ = newZ + j + 1;
          dragElevationRef.current.set(child.id, childZ);
          zElevations.set(child.id, childZ);
        });
      });
      elevateNodes(zElevations);
      setDraggingNodeIds(new Set(zElevations.keys()));
    },
    [yCards, yTokens, elevateNodes, setDraggingNodeIds],
  );

  // Broadcast every node in a selection drag (plus their carried tokens) via
  // awareness, mirroring onNodeDrag for the multi-node case.
  const onSelectionDrag = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      const dragNodes: DragNodeState[] = [];
      const positions = new Map<string, { x: number; y: number }>();
      nodes.forEach((node) => {
        const elevatedZ = dragElevationRef.current.get(node.id);
        dragNodes.push({ id: node.id, x: node.position.x, y: node.position.y, zIndex: elevatedZ ?? (node.zIndex as number ?? 0) });
        attachedChildren(node.id, yTokens).forEach((child) => {
          const offset = attachOffsetsRef.current.get(child.id);
          if (!offset) return;
          const x = node.position.x + offset.dx;
          const y = node.position.y + offset.dy;
          dragNodes.push({ id: child.id, x, y, zIndex: dragElevationRef.current.get(child.id) ?? child.zIndex });
          positions.set(child.id, { x, y });
        });
      });
      awareness?.setLocalStateField('drag', { nodes: dragNodes });
      if (positions.size > 0) translateNodes(positions);
    },
    [awareness, yTokens, translateNodes],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (event, node) => {
      // react-flow fires onNodeDragStop for every node in a selection drag too.
      // Skip here — onSelectionDragStop owns all Yjs writes for multi-node drags.
      if (isMultiDragRef.current) return;

      // Clear awareness drag so peers stop seeing the in-flight ghost.
      awareness?.setLocalStateField('drag', null);
      // Drag is over — stop shielding nodes from observer rebuilds.
      setDraggingNodeIds(new Set());

      const elevatedZ = dragElevationRef.current.get(node.id);
      dragElevationRef.current.delete(node.id);

      if (node.type === 'card') {
        // Check if card dropped on a pile. Use elementsFromPoint (plural) because
        // the dragged card sits on top and intercepts elementFromPoint.
        // On touchend the finger has already lifted, so `touches` is empty —
        // the released touch's final position lives in `changedTouches` instead.
        const clientX = 'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX ?? 0;
        const clientY = 'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY ?? 0;
        let pileTarget: PileDropTarget | null = null;
        for (const el of document.elementsFromPoint(clientX, clientY)) {
          pileTarget = findDropTarget(el);
          if (pileTarget) break;
        }
        if (pileTarget && (pileTarget.ownerId === null || pileTarget.ownerId === localPlayerId)) {
          moveCardFromBattlefield(node.id, pileTarget.pileType);
          attachOffsetsRef.current.clear();
          return;
        }

        finalizeCardDrag(node, yCards, yTokens, elevatedZ, dragElevationRef.current, attachOffsetsRef.current);
        attachOffsetsRef.current.clear();

        // Attach any free-floating tokens whose center now falls inside this card.
        const nodeFinalZ = elevatedZ ?? (yCards.get(node.id)?.zIndex ?? 0);
        yTokens.forEach((token, tokenId) => {
          if (token.attachedTo === node.id || token.attachedTo !== undefined) return;
          if (nodeContainsPoint(node.position, node.type ?? '', nodeCenter(token, 'token'))) {
            yTokens.set(tokenId, { ...token, attachedTo: node.id, zIndex: Math.max(token.zIndex, nodeFinalZ + 1) });
          }
        });
      } else if (node.type === 'token') {
        finalizeTokenDrag(node, yCards, yTokens, elevatedZ);
      }
    },
    [awareness, yCards, yTokens, localPlayerId, setDraggingNodeIds],
  );

  const onSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      isMultiDragRef.current = false;
      awareness?.setLocalStateField('drag', null);
      setDraggingNodeIds(new Set());
      const selectedTokenIds = new Set(nodes.filter((n) => n.type === 'token').map((n) => n.id));
      nodes.forEach((node) => {
        const elevatedZ = dragElevationRef.current.get(node.id);
        dragElevationRef.current.delete(node.id);
        if (node.type === 'card') {
          finalizeCardDrag(node, yCards, yTokens, elevatedZ, dragElevationRef.current, attachOffsetsRef.current, selectedTokenIds);
        } else if (node.type === 'token') {
          finalizeTokenDrag(node, yCards, yTokens, elevatedZ);
        }
      });
      attachOffsetsRef.current.clear();
    },
    [awareness, yCards, yTokens, setDraggingNodeIds],
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
      spawnTokenAtPosition(template, position, yCards, yTokens, localPlayerId);
    } catch (err) {
      console.error('Failed to create token from template:', err);
    }
  }, [screenToFlowPosition, yCards, yTokens, localPlayerId]);

  // A hovered health widget is raised above every card/token so a player can
  // always see and interact with it, even when cards are stacked on top.
  // Leaving hover restores it to whatever zIndex usePlaymatNodes assigned it.
  const [hoveredHealthNodeId, setHoveredHealthNodeId] = useState<string | null>(null);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'health') setHoveredHealthNodeId(node.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'health') {
      setHoveredHealthNodeId((current) => (current === node.id ? null : current));
    }
  }, []);

  // Playmat nodes first (lowest z-order by zIndex, not array position)
  const allNodes: Node[] = applyHealthHoverElevation(
    [...playmatNodes, ...cardTokenNodes],
    hoveredHealthNodeId,
  );

  return (
    <div ref={setBattlefieldRef} style={{ width: '100%', height: '100%' }} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <ReactFlow
        nodes={allNodes}
        edges={[]}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={onSelectionDragStop}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        // The handler also keeps pointer-events:all on non-draggable/selectable nodes (enemy cards/tokens).
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={() => useContextMenuStore.getState().close()}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          useContextMenuStore.getState().openMenu({
            target: { kind: 'board', x: event.clientX, y: event.clientY },
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onMoveStart={(event) => {
          useContextMenuStore.getState().close();

          // event is null for programmatic moves (our fitBounds), non-null for
          // a real user pan/zoom — only the latter stops board auto-centering
          // see: lastCenteredKeyRef for location of auto-centering on load
          if (event) hasUserMovedRef.current = true;
        }}
        snapToGrid={snapActive}
        snapGrid={[BACKGROUND_GRID_GAP, BACKGROUND_GRID_GAP]}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        deleteKeyCode={null}
        panOnScroll={false}
        panOnDrag={true}
        zoomOnDoubleClick={false}
        elevateNodesOnSelect={false} // react-flow adds +1000 to selected nodes by default, which overrides our manual z-ordering and pushes dragged cards above their attached tokens
        style={{ background: '#1a1a1a' }}
      >
        <Background
          size={1}
          color="#777777"
          gap={BACKGROUND_GRID_GAP}
        />
        <Controls position="bottom-right" />
        <Panel position="bottom-left">
          <SettingsButton />
        </Panel>
        <ViewportPortal>
          <div style={{ position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
            {peers.map(p => (
              <div key={p.clientId} style={{ position: 'absolute', transform: `translate(${p.x}px, ${p.y}px)` }}>
                <PeerCursor color={p.color} name={p.name} />
              </div>
            ))}
          </div>
        </ViewportPortal>
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
