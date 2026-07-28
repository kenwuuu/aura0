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
import { PeerCursorLayer } from './nodes/PeerCursorLayer';
import { AWARENESS_CURSOR } from './awareness';
import { usePlaymatNodes } from './usePlaymatNodes';
import { applyHealthHoverElevation } from './healthNodeHover';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { attachedChildren, findParent, nodeCenter, nodeContainsPoint } from './nodeAttachment';
import { findDropTarget, type PileDropTarget } from './dropTargetDetection';
import { spawnTokenAtPosition, getMaxZIndex } from './spawnToken';
import { computeGroupDragElevations } from './dragElevation';
import { moveCardFromBattlefield } from './battlefieldActions';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import { MIN_ZOOM, MAX_ZOOM, MAT_WIDTH, MAT_HEIGHT, BACKGROUND_GRID_GAP } from './boardWorld';
import type { Player } from '@/features/player';
import type { TokenService } from '@/infrastructure/cards';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { usePhoneLayout } from '@/shared/hooks';
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
  // On phone the bottom-left corner belongs to nothing (the full-width hand
  // covers the bottom edge) and the top-left hosts the HUD toggle stack, so
  // the settings gear + zoom controls move to the top-right. docs/architecture/responsive.md.
  const isPhone = usePhoneLayout();

  const { nodes: cardTokenNodes, onNodesChange, elevateNodes, translateNodes, setDraggingNodeIds } = useBattlefieldNodes(yCards, yTokens, localPlayerId, awareness);
  const { nodes: playmatNodes, localMatOrigin } = usePlaymatNodes(yDoc, localPlayerId);
  const { screenToFlowPosition, fitBounds } = useReactFlow();
  const { setNodeRef: setBattlefieldRef } = useDroppable({ id: 'battlefield' });

  // Expose screenToFlowPosition so dnd-kit's onDragEnd handler in App can convert
  // the drop pointer position to ReactFlow canvas coordinates.
  useEffect(() => {
    useGameInstance.getState().setScreenToFlowPosition(screenToFlowPosition);
  }, [screenToFlowPosition]);

  const { peers, registerCursorEl } = usePeerCursors(awareness, yDoc);
  const rafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  // Broadcast at most one cursor position per frame, and make it the *newest*
  // one. A leading-edge throttle (keep the first sample of the frame, drop the
  // rest) would put a frame of staleness on the wire before the packet even left.
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    pendingCursorRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const latest = pendingCursorRef.current;
      if (!latest) return;
      awareness?.setLocalStateField(AWARENESS_CURSOR, screenToFlowPosition(latest));
    });
  }, [awareness, screenToFlowPosition]);

  const onPointerLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingCursorRef.current = null;
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

  // Mirror react-flow's node selection (cards only) into hotkeyStore so the
  // app-level menu/hotkey layer — mounted outside <ReactFlowProvider> — can fan
  // an action out over the whole group. react-flow refires this when a selected
  // node leaves the graph (moved to a pile, deleted), so the set self-prunes.
  const onSelectionChange = useCallback((sel: { nodes: Node[] }) => {
    const ids = sel.nodes.filter((n) => n.type === 'card').map((n) => n.id);
    useHotkeyStore.getState().setSelectedCardIds(new Set(ids));
  }, []);

  // Center the camera on the local player's mat, and keep following it while the
  // seating settles during initial peer sync. When a player first loads in, only
  // their own player map exists, so they're seat 0; once peers sync in (with
  // earlier joinedAt), their seat index shifts and their mat moves. Re-centering
  // on each localMatOrigin change keeps the camera on the local mat instead of
  // leaving it parked on what becomes the first player's board. We stop the
  // moment the user manually pans/zooms so we never yank the viewport.
  const hasUserMovedRef = useRef(false);

  // The wrapper DOM node, needed for the native touch-tap listeners below.
  // `useDroppable`'s `setBattlefieldRef` is a callback ref, so tee it into our
  // own ref rather than clobbering it.
  const wrapperElRef = useRef<HTMLDivElement | null>(null);
  const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
    wrapperElRef.current = node;
    setBattlefieldRef(node);
  }, [setBattlefieldRef]);

  // Pointer type of the in-flight pane gesture, so `onPaneClick` (a MouseEvent,
  // no `pointerType`) can stay out of the way of touch — a touch pane tap is
  // handled entirely by the native listeners below, and Firefox still fires a
  // compat `click` on the pane afterwards that would otherwise close the menu
  // we just opened.
  const panePointerTypeRef = useRef<string>('mouse');

  // Touch tap on the empty board → open the global-actions menu (the touch
  // equivalent of a right-click on empty space). Two reasons this must be a
  // *native, capture-phase* listener rather than react-flow's `onPaneClick` or
  // React's own `onPointerUpCapture`:
  //  1. react-flow's D3-zoom swallows the touch→click on the pane, so
  //     `onPaneClick` never fires for touch on Chromium;
  //  2. once D3-zoom pointer-captures the pane, Firefox stops delivering the
  //     pointer events to React's synthetic capture listeners entirely — only
  //     a native capture listener on the wrapper still sees them.
  // `menuWasOpen` snapshots whether a menu was open when the tap began: if it
  // was, the tap is a dismiss (react-flow's `onMoveStart` and Radix both close
  // it mid-gesture) and must not re-open a board menu; only a tap that began
  // with nothing open summons one. `previewWasVisible` does the same for the
  // card preview: an empty-board tap while a preview is up dismisses the
  // preview and must NOT summon a board menu in its place.
  useEffect(() => {
    const el = wrapperElRef.current;
    if (!el) return;
    let start: { x: number; y: number; menuWasOpen: boolean; previewWasVisible: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const insidePane = !!el?.closest('.react-flow__pane');
      if (insidePane) panePointerTypeRef.current = e.pointerType;
      // `.react-flow__pane` is an *ancestor* of the viewport, so every node
      // (card, token, pile, health) is "inside the pane" by `closest`. This
      // handler summons the *empty-board* menu, so it must fire only where
      // there is no node under the finger — otherwise it hijacks every node
      // tap, and on a card that's fatal: the `previewWasVisible` branch below
      // runs on the second tap, hiding the preview and returning before the
      // card's own handler sees it, so the two-tap machine can never advance
      // from preview to menu.
      const onEmptyPane = insidePane && !el?.closest('.react-flow__node');
      start = onEmptyPane && e.pointerType !== 'mouse'
        ? {
            x: e.clientX,
            y: e.clientY,
            menuWasOpen: useContextMenuStore.getState().isOpen,
            previewWasVisible: useCardPreviewStore.getState().isVisible,
          }
        : null;
    };
    const onUp = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || s.menuWasOpen) return;
      // Only a genuine tap (small travel) — a pan/pinch travels further.
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) return;
      // A tap on empty space while a preview is up dismisses it — no menu.
      if (s.previewWasVisible) {
        useCardPreviewStore.getState().hide();
        return;
      }
      useContextMenuStore.getState().openMenu({
        target: { kind: 'board', x: e.clientX, y: e.clientY },
        x: e.clientX,
        y: e.clientY,
      });
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
    };
  }, []);
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

  // A drag started on a node moves *every selected node* together (react-flow's
  // `getDragItems` gathers all `selected` nodes), and the third callback arg is
  // that full set. A single unselected card drags as a group of one. Because the
  // box-selection overlay is click-through (see reactFlowControls.css), grabbing
  // any card — whether picked via ⌘/Ctrl-click or a shift box-select — routes
  // through these `onNodeDrag*` handlers, so this one path serves both gestures
  // and react-flow's separate `onSelectionDrag*` callbacks are never used.
  const dragSet = (node: Node, nodes: Node[]): Node[] => (nodes.length > 1 ? nodes : [node]);

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node, nodes) => {
      useContextMenuStore.getState().close();
      // Dragging a board card dismisses any preview showing for it (on touch the
      // preview was raised by a first tap; the drag supersedes it).
      useCardPreviewStore.getState().hide();

      const dragged = dragSet(node, nodes);
      const baseZ = getMaxZIndex(yCards, yTokens);
      const draggedIds = new Set(dragged.map((n) => n.id));

      // Lift the whole selection above the board while preserving its internal
      // stacking order (react-flow gathers selected nodes in array order, not
      // z-order, so a naive `baseZ + index` reshuffles overlapping stacks). This
      // also carries each node's attached tokens along, just above their parent.
      const { zIndices, childOffsets } = computeGroupDragElevations(
        dragged.map((n) => ({ id: n.id, position: n.position, zIndex: n.zIndex })),
        baseZ,
        draggedIds,
        (parentId) => attachedChildren(parentId, yTokens),
      );

      for (const [id, z] of zIndices) dragElevationRef.current.set(id, z);
      // Store each carried child's offset from its parent origin so we can
      // recompute its absolute position purely from the parent's drag position.
      for (const [id, offset] of childOffsets) attachOffsetsRef.current.set(id, offset);

      // Apply every elevation in one setNodes call so a card never briefly
      // appears above its own tokens between two separate state updates.
      elevateNodes(zIndices);
      // The dragged nodes and their carried tokens are now locally controlled —
      // shield them from observer rebuilds triggered by a peer's concurrent Yjs
      // write, which would otherwise snap them to their stale pre-drag position.
      setDraggingNodeIds(new Set(zIndices.keys()));
    },
    [yCards, yTokens, elevateNodes, setDraggingNodeIds],
  );

  // Broadcast every dragged node (plus its carried tokens) via awareness on each
  // frame so peers see live movement without touching the Yjs document. Final
  // positions are committed to Yjs only on drag-stop. The dragged nodes' own
  // positions are driven by react-flow; we only translate their attached tokens.
  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node, nodes) => {
      const dragNodes: DragNodeState[] = [];
      const positions = new Map<string, { x: number; y: number }>();
      dragSet(node, nodes).forEach((n) => {
        const elevatedZ = dragElevationRef.current.get(n.id);
        dragNodes.push({ id: n.id, x: n.position.x, y: n.position.y, zIndex: elevatedZ ?? (n.zIndex as number ?? 0) });
        attachedChildren(n.id, yTokens).forEach((child) => {
          const offset = attachOffsetsRef.current.get(child.id);
          if (!offset) return;
          const x = n.position.x + offset.dx;
          const y = n.position.y + offset.dy;
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
    (event, node, nodes) => {
      // Clear awareness drag so peers stop seeing the in-flight ghost.
      awareness?.setLocalStateField('drag', null);
      // Drag is over — stop shielding nodes from observer rebuilds.
      setDraggingNodeIds(new Set());

      // Multi-node drag: commit every node's final position. Pile-drop and
      // free-token attachment stay single-card affordances (both are ambiguous
      // for a group), so they live in the single-node branch below.
      if (nodes.length > 1) {
        const selectedTokenIds = new Set(nodes.filter((n) => n.type === 'token').map((n) => n.id));
        nodes.forEach((n) => {
          const elevatedZ = dragElevationRef.current.get(n.id);
          dragElevationRef.current.delete(n.id);
          if (n.type === 'card') {
            finalizeCardDrag(n, yCards, yTokens, elevatedZ, dragElevationRef.current, attachOffsetsRef.current, selectedTokenIds);
          } else if (n.type === 'token') {
            finalizeTokenDrag(n, yCards, yTokens, elevatedZ);
          }
        });
        attachOffsetsRef.current.clear();
        return;
      }

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
        // Two separate ownership questions, and both must pass. Whose *pile*:
        // cards only ever go into your own zones. Whose *card*: an opponent's
        // card may be shoved around the board freely but not swept into your
        // deck by a drag that happened to end over it — `moveCardFromBattlefield`
        // refuses it anyway, and without this check the drop would take that
        // path and return having committed nothing, leaving the card parked at
        // its new position locally until the next Yjs write snapped it back.
        const ownCard = yCards.get(node.id)?.ownerId === localPlayerId;
        if (ownCard && pileTarget && (pileTarget.ownerId === null || pileTarget.ownerId === localPlayerId)) {
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
    <div
      ref={setWrapperRef}
      style={{ width: '100%', height: '100%' }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <ReactFlow
        nodes={allNodes}
        edges={[]}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        // Additive multi-pick: ⌘ (Mac) / Ctrl (Win/Linux) + click toggles a card
        // into the box-selected group. Note macOS turns literal Ctrl+click into a
        // right-click, so ⌘ is the working Mac modifier. Shift still box-selects.
        multiSelectionKeyCode={['Meta', 'Control']}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        // The handler also keeps pointer-events:all on non-draggable/selectable nodes (enemy cards/tokens).
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        // Mouse only — a left-click on the empty pane dismisses any open menu.
        // On touch this fires inconsistently (Chromium's D3-zoom eats the
        // touch→click, Firefox lets it through) and would close the menu the
        // native tap listeners just opened, so touch is handled entirely above
        // (open) plus Radix's outside-pointer dismiss (close).
        onPaneClick={() => {
          if (panePointerTypeRef.current !== 'mouse') return;
          useContextMenuStore.getState().close();
        }}
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
          // Panning/zooming the board dismisses a raised preview as well.
          useCardPreviewStore.getState().hide();

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
        colorMode="dark" // also fixes the built-in attribution link: its default light-mode background is a translucent white pill that's illegible on our dark board
      >
        <Background
          size={1}
          color="#777777"
          gap={BACKGROUND_GRID_GAP}
        />
        {/* The top/bottom margin offsets the Controls away from the settings
            button — both anchor to the same corner (bottom-left on desktop,
            top-right on phone), so without it they'd overlap. */}
        {/* Phone margins mirror the PhoneHudStack toggles across the screen:
            8px from the toolbar and screen edge plus the safe-area right inset
            (the right edge's inset owner, per docs/architecture/responsive.md), and an 8px
            gap below the 34px settings button (8 + 34 + 8 = 50). */}
        <Controls
          position={isPhone ? 'top-right' : 'bottom-left'}
          showFitView={false}
          showInteractive={false}
          style={
            isPhone
              ? { margin: 8, marginTop: 50, marginRight: 'calc(8px + env(safe-area-inset-right, 0px))' }
              : { marginBottom: 55 }
          }
        />
        <Panel
          position={isPhone ? 'top-right' : 'bottom-left'}
          style={isPhone ? { margin: 8, marginRight: 'calc(8px + env(safe-area-inset-right, 0px))' } : undefined}
        >
          <SettingsButton />
        </Panel>
        <ViewportPortal>
          <PeerCursorLayer peers={peers} registerCursorEl={registerCursorEl} />
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
