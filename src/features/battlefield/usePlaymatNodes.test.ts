/**
 * Tests for buildPlaymatNodes — the per-player synthetic node builder.
 *
 * Uses a real Y.Doc (no mocks) to validate:
 * - Node counts and types per player
 * - Seat assignment by joinedAt timestamp
 * - Pile counts derived from Yjs array lengths
 * - allowViewHand plumbing to opponent hand node
 * - Opponent hand node is NOT emitted for local player
 * - All synthetic nodes are non-draggable
 * - Deterministic seat order when joinedAt timestamps tie
 * - A new player discovered after initial build gets the next seat
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { buildPlaymatNodes, usePlaymatNodes } from './usePlaymatNodes';
import {
  YSTATE_JOINED_AT,
  YSTATE_HEALTH,
  YSTATE_PLAYER_NAME,
  YSTATE_DECK,
  YSTATE_HAND,
  YSTATE_EXILE_PILE,
  YSTATE_DISCARD_PILE,
  YSTATE_SIDEBOARD,
  YSTATE_CUSTOM_COUNTERS,
  YSTATE_CAN_VIEW_HAND,
  YDOC_PLAYER,
} from '@/constants';
import { seatOrigin, playmatNodePositions } from './boardWorld';

function writePlayer(yDoc: Y.Doc, playerId: string, options: {
  joinedAt?: number;
  health?: number;
  deck?: unknown[];
  hand?: unknown[];
  exile?: unknown[];
  discard?: unknown[];
  sideboard?: unknown[];
  allowViewHand?: boolean;
} = {}) {
  const map = yDoc.getMap(YDOC_PLAYER(playerId));
  map.set(YSTATE_JOINED_AT, options.joinedAt ?? Date.now());
  map.set(YSTATE_HEALTH, options.health ?? 40);
  map.set(YSTATE_PLAYER_NAME, `Player-${playerId.slice(0, 4)}`);
  map.set(YSTATE_DECK, options.deck ?? []);
  map.set(YSTATE_HAND, options.hand ?? []);
  map.set(YSTATE_EXILE_PILE, options.exile ?? []);
  map.set(YSTATE_DISCARD_PILE, options.discard ?? []);
  map.set(YSTATE_SIDEBOARD, options.sideboard ?? []);
  map.set(YSTATE_CUSTOM_COUNTERS, []);
  map.set(YSTATE_CAN_VIEW_HAND, options.allowViewHand ?? false);
}

describe('buildPlaymatNodes', () => {
  it('emits 5 nodes per player when the sideboard is empty (playmat, health, deck, discard, exile — no sideboard tile)', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    const types = nodes.map((n) => n.type);
    expect(types).toContain('playmat');
    expect(types).toContain('health');
    expect(types.filter((t) => t === 'pile')).toHaveLength(3); // deck, discard, exile
    expect(nodes.find((n) => n.id === 'pile-sideboard-local-p1')).toBeUndefined();
    expect(nodes).toHaveLength(5);
  });

  it('emits a sideboard tile only when the deck imported with sideboard cards', () => {
    // The tile is clutter for the common no-sideboard deck, so it is hidden until
    // the zone actually holds cards. See buildPlaymatNodes for the rationale.
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, sideboard: [{}, {}] });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    const sideboard = nodes.find((n) => n.id === 'pile-sideboard-local-p1');
    expect(sideboard).toBeDefined();
    expect((sideboard!.data as any).count).toBe(2);
    expect(nodes.filter((n) => n.type === 'pile')).toHaveLength(4); // deck, discard, exile, sideboard
  });

  it('emits a sideboard pile for every player who has one, including opponents', () => {
    // Opponents get one too: the count is public in paper Magic even though the
    // contents never are. PileNode is what gates opening it (pileNodeLogic).
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, sideboard: [{}] });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200, sideboard: [{}] });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    const sideboardIds = nodes.filter((n) => n.id.startsWith('pile-sideboard-')).map((n) => n.id);
    expect(sideboardIds.sort()).toEqual(['pile-sideboard-local-p1', 'pile-sideboard-opp-p2']);
  });

  it('hides the sideboard tile for a player whose sideboard is empty while showing it for one who has cards', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, sideboard: [{}] });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200 }); // imported without a sideboard

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    expect(nodes.find((n) => n.id === 'pile-sideboard-local-p1')).toBeDefined();
    expect(nodes.find((n) => n.id === 'pile-sideboard-opp-p2')).toBeUndefined();
  });

  it('places the sideboard left of the deck, clear of discard and exile', () => {
    // The pile column is full at four, so the sideboard opens a second column —
    // but only beside the deck. If it ever shared a row with discard or exile it
    // would be fencing off battlefield space those piles do not need.
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, sideboard: [{}] });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');
    const at = (id: string) => nodes.find((n) => n.id === id)!.position;

    const sideboard = at('pile-sideboard-local-p1');
    const deck = at('pile-deck-local-p1');

    expect(sideboard.x).toBeLessThan(deck.x);
    expect(sideboard.y).toBe(deck.y);
    expect(sideboard.y).toBeLessThan(at('pile-discard-local-p1').y);
  });

  it('emits an opponent hand pile for non-local players only', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200, allowViewHand: true });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    const handNodes = nodes.filter((n) => n.id.startsWith('pile-hand-'));
    expect(handNodes).toHaveLength(1);
    expect(handNodes[0].id).toBe('pile-hand-opp-p2');

    // Local player should NOT have a hand node
    expect(nodes.find((n) => n.id === 'pile-hand-local-p1')).toBeUndefined();
  });

  it('derives pile counts from Yjs array lengths', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', {
      joinedAt: 100,
      deck: [{}, {}, {}],           // 3 cards
      exile: [{}, {}],              // 2 cards
      discard: [{}],               // 1 card
    });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    const deck = nodes.find((n) => n.id === 'pile-deck-local-p1');
    const exile = nodes.find((n) => n.id === 'pile-exile-local-p1');
    const discard = nodes.find((n) => n.id === 'pile-discard-local-p1');

    expect((deck!.data as any).count).toBe(3);
    expect((exile!.data as any).count).toBe(2);
    expect((discard!.data as any).count).toBe(1);
  });

  it('plumbs allowViewHand onto opponent hand node', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200, allowViewHand: true });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');
    const handNode = nodes.find((n) => n.id === 'pile-hand-opp-p2');

    expect((handNode!.data as any).allowViewHand).toBe(true);
  });

  it('marks allowViewHand false when not set', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200, allowViewHand: false });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');
    const handNode = nodes.find((n) => n.id === 'pile-hand-opp-p2');

    expect((handNode!.data as any).allowViewHand).toBe(false);
  });

  it('all synthetic nodes are non-draggable', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200 });

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');

    nodes.forEach((n) => {
      expect(n.draggable).toBe(false);
    });
  });

  it('assigns seat 0 (bottom row, col 0) to the earliest joiner', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });  // joins first → seat 0
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200 });    // joins second → seat 1

    const nodes = buildPlaymatNodes(yDoc, 'local-p1');
    const localMat = nodes.find((n) => n.id === 'playmat-local-p1')!;
    const oppMat = nodes.find((n) => n.id === 'playmat-opp-p2')!;

    const seat0 = playmatNodePositions(0).mat;  // bottom row, col 0
    const seat1 = playmatNodePositions(1).mat;  // top row, col 0

    expect(localMat.position).toEqual(seat0);
    expect(oppMat.position).toEqual(seat1);
  });

  it('uses stable seat order: opponent with earlier joinedAt keeps seat even when local has later ID', () => {
    const yDoc = new Y.Doc();
    // opp joined earlier (lower joinedAt) → seat 0
    writePlayer(yDoc, 'opp-aaa', { joinedAt: 50 });
    // local joined later → seat 1
    writePlayer(yDoc, 'local-zzz', { joinedAt: 200 });

    const nodes = buildPlaymatNodes(yDoc, 'local-zzz');
    const oppMat = nodes.find((n) => n.id === 'playmat-opp-aaa')!;
    const localMat = nodes.find((n) => n.id === 'playmat-local-zzz')!;

    expect(oppMat.position).toEqual(playmatNodePositions(0).mat);
    expect(localMat.position).toEqual(playmatNodePositions(1).mat);
  });

  it('breaks joinedAt ties deterministically by playerId', () => {
    const yDoc = new Y.Doc();
    const sameTs = 999;
    writePlayer(yDoc, 'aaa', { joinedAt: sameTs });
    writePlayer(yDoc, 'bbb', { joinedAt: sameTs });
    writePlayer(yDoc, 'ccc', { joinedAt: sameTs });

    const nodes = buildPlaymatNodes(yDoc, 'aaa');
    const aMat = nodes.find((n) => n.id === 'playmat-aaa')!;
    const bMat = nodes.find((n) => n.id === 'playmat-bbb')!;
    const cMat = nodes.find((n) => n.id === 'playmat-ccc')!;

    // aaa < bbb < ccc → seats 0, 1, 2
    expect(aMat.position).toEqual(playmatNodePositions(0).mat);
    expect(bMat.position).toEqual(playmatNodePositions(1).mat);
    expect(cMat.position).toEqual(playmatNodePositions(2).mat);
  });

  it('a new player added after initial build takes the next seat without shifting existing seats', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    writePlayer(yDoc, 'opp-p2', { joinedAt: 200 });

    const before = buildPlaymatNodes(yDoc, 'local-p1');
    const p1MatBefore = before.find((n) => n.id === 'playmat-local-p1')!;
    const p2MatBefore = before.find((n) => n.id === 'playmat-opp-p2')!;

    // New player joins with a later timestamp
    writePlayer(yDoc, 'opp-p3', { joinedAt: 300 });

    const after = buildPlaymatNodes(yDoc, 'local-p1');
    const p1MatAfter = after.find((n) => n.id === 'playmat-local-p1')!;
    const p2MatAfter = after.find((n) => n.id === 'playmat-opp-p2')!;
    const p3MatAfter = after.find((n) => n.id === 'playmat-opp-p3')!;

    // Existing seats unchanged
    expect(p1MatAfter.position).toEqual(p1MatBefore.position);
    expect(p2MatAfter.position).toEqual(p2MatBefore.position);
    // New player takes seat 2 (bottom row, col 1)
    expect(p3MatAfter.position).toEqual(playmatNodePositions(2).mat);
  });

  it('seatOrigin: two-row grid — even seats on bottom row, odd on top', () => {
    // bottom row: y = MAT_HEIGHT + MAT_ROW_GAP > 0
    // top row: y = 0
    expect(seatOrigin(0).y).toBeGreaterThan(0);   // seat 0 → bottom
    expect(seatOrigin(1).y).toBe(0);              // seat 1 → top
    expect(seatOrigin(2).y).toBeGreaterThan(0);   // seat 2 → bottom
    expect(seatOrigin(3).y).toBe(0);              // seat 3 → top
  });

  it('seatOrigin: columns extend rightward every 2 seats', () => {
    expect(seatOrigin(0).x).toBe(seatOrigin(1).x);  // same column
    expect(seatOrigin(2).x).toBe(seatOrigin(3).x);  // same column
    expect(seatOrigin(2).x).toBeGreaterThan(seatOrigin(0).x); // col 1 > col 0
    expect(seatOrigin(4).x).toBeGreaterThan(seatOrigin(2).x); // col 2 > col 1
  });
});

describe('usePlaymatNodes hook', () => {
  it('builds nodes and localMatOrigin on initial render', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));

    expect(result.current.nodes.length).toBeGreaterThan(0);
    expect(result.current.localMatOrigin).toEqual(playmatNodePositions(0).mat);
  });

  it('returns a null localMatOrigin when the local player has not joined yet', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'opp-p2', { joinedAt: 100 });

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));

    expect(result.current.localMatOrigin).toBeNull();
  });

  it('rebuilds nodes after a Yjs doc update, debounced to the next animation frame', async () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, health: 40 });

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));

    act(() => {
      yDoc.getMap(YDOC_PLAYER('local-p1')).set(YSTATE_HEALTH, 25);
    });

    await waitFor(() => {
      const health = result.current.nodes.find((n) => n.id === 'health-local-p1');
      expect((health!.data as any).health).toBe(25);
    });
  });

  it('collapses several rapid doc updates into a single rebuild per animation frame', async () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, health: 40 });

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));
    const nodesBeforeRebuild = result.current.nodes;

    act(() => {
      const map = yDoc.getMap(YDOC_PLAYER('local-p1'));
      map.set(YSTATE_HEALTH, 30);
      map.set(YSTATE_HEALTH, 20);
      map.set(YSTATE_HEALTH, 10);
    });

    await waitFor(() => {
      expect(result.current.nodes).not.toBe(nodesBeforeRebuild);
    });
    const health = result.current.nodes.find((n) => n.id === 'health-local-p1');
    expect((health!.data as any).health).toBe(10);
  });

  it('adds the sideboard tile on the next rebuild once a card lands in an empty sideboard', async () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 }); // starts with no sideboard

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));
    expect(result.current.nodes.find((n) => n.id === 'pile-sideboard-local-p1')).toBeUndefined();

    act(() => {
      yDoc.getMap(YDOC_PLAYER('local-p1')).set(YSTATE_SIDEBOARD, [{}]);
    });

    await waitFor(() => {
      expect(result.current.nodes.find((n) => n.id === 'pile-sideboard-local-p1')).toBeDefined();
    });
  });

  it('rebuilds when the tab becomes visible again', async () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100, health: 40 });

    const { result } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));

    // Change state without going through the doc-update path check by writing
    // directly, then simulate a visibility change to prove *that* listener
    // independently triggers a rebuild.
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    yDoc.getMap(YDOC_PLAYER('local-p1')).set(YSTATE_HEALTH, 15);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      const health = result.current.nodes.find((n) => n.id === 'health-local-p1');
      expect((health!.data as any).health).toBe(15);
    });
  });

  it('removes the doc, visibility, and interval listeners on unmount', () => {
    const yDoc = new Y.Doc();
    writePlayer(yDoc, 'local-p1', { joinedAt: 100 });
    const offSpy = vi.spyOn(yDoc, 'off');
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => usePlaymatNodes(yDoc, 'local-p1'));
    unmount();

    expect(offSpy).toHaveBeenCalledWith('update', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
