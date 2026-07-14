/**
 * usePlaymatNodes — Yjs → react-flow bridge for per-player synthetic nodes.
 *
 * Separate from useBattlefieldNodes intentionally: synthetic nodes (playmat,
 * health, piles) are never persisted by drag, so they must NOT pass through
 * `applyNodeChanges` — that would cause position drift on drag events.
 *
 * Player discovery: rebuilds on every `yDoc.on('update')` event (debounced
 * to one rAF per frame) so new peers are picked up reactively. A 2-second
 * fallback interval handles any edge cases. Both are cleaned up on unmount.
 */
import { useState, useEffect } from 'react';
import { Node } from '@xyflow/react';
import * as Y from 'yjs';
import { CustomCounter, Card } from '@/features/player/types';
import {
  YSTATE_JOINED_AT,
  YSTATE_HEALTH,
  YSTATE_PLAYER_NAME,
  YSTATE_CUSTOM_COUNTERS,
  YSTATE_DECK,
  YSTATE_SIDEBOARD,
  YSTATE_HAND,
  YSTATE_EXILE_PILE,
  YSTATE_DISCARD_PILE,
  YSTATE_CAN_VIEW_HAND,
} from '@/constants';
import { playmatNodePositions, MAT_WIDTH, MAT_HEIGHT, CARD_WIDTH, CARD_HEIGHT, HEALTH_WIDGET_WIDTH, HEALTH_WIDGET_HEIGHT } from './boardWorld';

export function buildPlaymatNodes(yDoc: Y.Doc, localPlayerId: string): Node[] {
  const nodes: Node[] = [];

  // Collect all player maps
  const playerEntries: { playerId: string; joinedAt: number; map: Y.Map<any> }[] = [];
  yDoc.share.forEach((_, key) => {
    if (!key.startsWith('player-')) return;
    const playerId = key.slice('player-'.length);
    const map = yDoc.getMap(key);
    const joinedAt = (map.get(YSTATE_JOINED_AT) as number | undefined) ?? 0;
    playerEntries.push({ playerId, joinedAt, map });
  });

  // Sort by joinedAt, then playerId for determinism when timestamps collide
  playerEntries.sort((a, b) =>
    a.joinedAt !== b.joinedAt
      ? a.joinedAt - b.joinedAt
      : a.playerId.localeCompare(b.playerId),
  );

  playerEntries.forEach(({ playerId, map }, seatIndex) => {
    const isLocal = playerId === localPlayerId;
    const positions = playmatNodePositions(seatIndex);

    const name = (map.get(YSTATE_PLAYER_NAME) as string | undefined) ?? playerId.slice(0, 9);
    const health = (map.get(YSTATE_HEALTH) as number | undefined) ?? 40;
    const customCounters = (map.get(YSTATE_CUSTOM_COUNTERS) as CustomCounter[] | undefined) ?? [];
    const deck = (map.get(YSTATE_DECK) as Card[] | undefined) ?? [];
    const exilePile = (map.get(YSTATE_EXILE_PILE) as Card[] | undefined) ?? [];
    const discardPile = (map.get(YSTATE_DISCARD_PILE) as Card[] | undefined) ?? [];
    const hand = (map.get(YSTATE_HAND) as Card[] | undefined) ?? [];
    // Absent for players whose state predates the sideboard — an empty pile, not a missing one.
    const sideboard = (map.get(YSTATE_SIDEBOARD) as Card[] | undefined) ?? [];
    const allowViewHand = (map.get(YSTATE_CAN_VIEW_HAND) as boolean | undefined) ?? false;

    // Playmat background.
    // width/height must be set explicitly so React Flow's nodeHasDimensions()
    // returns true immediately (it falls back to node.width when measured is
    // undefined). Without this, every call to buildPlaymatNodes() produces new
    // node objects with no measured field, causing React Flow to re-initialise
    // the node as hidden until ResizeObserver fires — which, on tab-switch, can
    // happen after the first paint, making the mat visibly disappear.
    nodes.push({
      id: `playmat-${playerId}`,
      type: 'playmat',
      position: positions.mat,
      data: { ownerId: playerId, isLocal },
      zIndex: 0,
      draggable: false,
      selectable: false,
      width: MAT_WIDTH,
      height: MAT_HEIGHT,
    });

    // Health widget
    // selectable intentionally omitted (defaults to true) so react-flow sets
    // pointer-events: all on the wrapper — required for button clicks to land.
    nodes.push({
      id: `health-${playerId}`,
      type: 'health',
      position: positions.health,
      data: { ownerId: playerId, isLocal, name, health, customCounters, yDoc },
      zIndex: 1, // explicitly above the playmat's 0 — don't rely on push-order tiebreaking
      draggable: false,
      // initialWidth/Height (not width/height) so React Flow uses these only as a
      // first-paint hint, then measures the real widget. The visible widget is
      // width: fit-content and grows on hover (counter strip), so a hardcoded
      // width/height would pin the wrapper to a fixed box wider than the content —
      // leaving a transparent, pointer-events:all strip that blocks dragging cards
      // beneath it. These still satisfy nodeHasDimensions() to avoid the
      // disappear-on-tab-switch flash. See boardWorld.ts HEALTH_WIDGET_* notes.
      initialWidth: HEALTH_WIDGET_WIDTH,
      initialHeight: HEALTH_WIDGET_HEIGHT,
    });

    // Deck pile
    nodes.push({
      id: `pile-deck-${playerId}`,
      type: 'pile',
      position: positions.deck,
      data: { ownerId: playerId, isLocal, pileKind: 'deck', count: deck.length, allowViewHand: false, yDoc },
      zIndex: 10,
      draggable: false,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });

    // Discard pile
    nodes.push({
      id: `pile-discard-${playerId}`,
      type: 'pile',
      position: positions.discard,
      data: { ownerId: playerId, isLocal, pileKind: 'discard', count: discardPile.length, allowViewHand: false, yDoc },
      zIndex: 10,
      draggable: false,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });

    // Exile pile
    nodes.push({
      id: `pile-exile-${playerId}`,
      type: 'pile',
      position: positions.exile,
      data: { ownerId: playerId, isLocal, pileKind: 'exile', count: exilePile.length, allowViewHand: false, yDoc },
      zIndex: 10,
      draggable: false,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });

    // Sideboard pile — emitted for everyone, but only its owner can open it.
    // An opponent sees the count and nothing else, which is what a sideboard is
    // in paper Magic: you may know it holds 15 cards, never which 15. The
    // contents gate lives in PileNode, alongside the hand's.
    nodes.push({
      id: `pile-sideboard-${playerId}`,
      type: 'pile',
      position: positions.sideboard,
      data: { ownerId: playerId, isLocal, pileKind: 'sideboard', count: sideboard.length, allowViewHand: false, yDoc },
      zIndex: 10,
      draggable: false,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });

    // Opponent hand pile — always emitted for opponents; gating is handled in PileNode
    if (!isLocal) {
      nodes.push({
        id: `pile-hand-${playerId}`,
        type: 'pile',
        position: positions.hand,
        data: { ownerId: playerId, isLocal, pileKind: 'hand', count: hand.length, allowViewHand, yDoc },
        zIndex: 10,
        draggable: false,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
    }
  });

  return nodes;
}

function computeLocalMatOrigin(
  yDoc: Y.Doc,
  localPlayerId: string,
): { x: number; y: number } | null {
  const entries: { playerId: string; joinedAt: number }[] = [];
  yDoc.share.forEach((_, key) => {
    if (!key.startsWith('player-')) return;
    const playerId = key.slice('player-'.length);
    const map = yDoc.getMap(key);
    const joinedAt = (map.get(YSTATE_JOINED_AT) as number | undefined) ?? 0;
    entries.push({ playerId, joinedAt });
  });
  entries.sort((a, b) =>
    a.joinedAt !== b.joinedAt
      ? a.joinedAt - b.joinedAt
      : a.playerId.localeCompare(b.playerId),
  );
  const seatIndex = entries.findIndex((e) => e.playerId === localPlayerId);
  if (seatIndex === -1) return null;
  return playmatNodePositions(seatIndex).mat;
}

export function usePlaymatNodes(
  yDoc: Y.Doc,
  localPlayerId: string,
): { nodes: Node[]; localMatOrigin: { x: number; y: number } | null } {
  const [nodes, setNodes] = useState<Node[]>(() =>
    buildPlaymatNodes(yDoc, localPlayerId),
  );
  const [localMatOrigin, setLocalMatOrigin] = useState<{ x: number; y: number } | null>(
    () => computeLocalMatOrigin(yDoc, localPlayerId),
  );

  useEffect(() => {
    let rafId: number | null = null;

    const rebuild = () => {
      const newNodes = buildPlaymatNodes(yDoc, localPlayerId);
      setNodes(newNodes);
      setLocalMatOrigin(computeLocalMatOrigin(yDoc, localPlayerId));
    };

    const onDocUpdate = () => {
      // Debounce to at most one rebuild per animation frame — updates can fire
      // rapidly (e.g. during card drags) and we don't need per-update precision.
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(rebuild);
    };

    const onVisibilityChange = () => {
      if (!document.hidden) rebuild();
    };

    yDoc.on('update', onDocUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    rebuild(); // Build immediately (don't wait for first update)

    // Fallback: re-scan every 2s to pick up any edge cases the doc-update
    // observer might miss (e.g. when a new player's map exists before any
    // update is delivered to us). Remove once verified stable.
    const interval = setInterval(rebuild, 2000);

    return () => {
      yDoc.off('update', onDocUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [yDoc, localPlayerId]);

  return { nodes, localMatOrigin };
}
