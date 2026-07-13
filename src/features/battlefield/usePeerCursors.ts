import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { CursorState } from './awareness';
import { easePoint, type Point } from './peerMotion';
import { colorFromPlayerId } from '@/features/player';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME, YSTATE_PLAYER_COLOR } from '@/constants';

/**
 * Who has a cursor on the board. Deliberately position-free: this is the part
 * that goes through React, and it changes only when a peer joins, leaves, or is
 * renamed. Positions never touch React state — see `registerCursorEl`.
 */
export interface PeerCursorIdentity {
  clientId: number;
  name: string;
  color: string;
}

export interface PeerCursors {
  peers: PeerCursorIdentity[];
  /** Ref callback for a peer's cursor element. The hook drives its transform. */
  registerCursorEl: (clientId: number, el: HTMLElement | null) => void;
}

function sameRoster(a: PeerCursorIdentity[], b: PeerCursorIdentity[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.clientId === b[i].clientId && p.name === b[i].name && p.color === b[i].color)
  );
}

/**
 * Live peer cursors, painted by writing `transform` straight to the DOM rather
 * than by re-rendering.
 *
 * Cursors move at pointer rate. Routing that through React state re-rendered the
 * whole battlefield — and with it re-adopted every react-flow node — up to 60
 * times a second per peer, so this hook hands out element refs and animates them
 * itself. The only thing it re-renders for is the roster.
 */
export function usePeerCursors(awareness: Awareness | null, yDoc: Y.Doc | null): PeerCursors {
  const [peers, setPeers] = useState<PeerCursorIdentity[]>([]);

  // Where each peer actually is (targets) vs. where we have painted them
  // (shown). The gap between the two is what the ease closes, frame by frame.
  const targetsRef = useRef<Map<number, Point>>(new Map());
  const shownRef = useRef<Map<number, Point>>(new Map());
  const elsRef = useRef<Map<number, HTMLElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const registerCursorEl = useCallback((clientId: number, el: HTMLElement | null) => {
    if (!el) {
      elsRef.current.delete(clientId);
      return;
    }
    elsRef.current.set(clientId, el);
    // The element mounts a frame after we first learn the peer's position, so
    // paint it on attach — otherwise a newly-seen cursor sits at the board
    // origin until that peer's next move.
    const p = shownRef.current.get(clientId) ?? targetsRef.current.get(clientId);
    if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }, []);

  useEffect(() => {
    if (!awareness) return;

    const step = (now: number) => {
      const dt = lastFrameRef.current === 0 ? 16.7 : now - lastFrameRef.current;
      lastFrameRef.current = now;

      let animating = false;
      targetsRef.current.forEach((target, clientId) => {
        const shown = shownRef.current.get(clientId);
        // First sighting: appear where the peer actually is. Easing in from a
        // position we never held would fly the cursor in across the board.
        const next = shown ? easePoint(shown, target, dt) : { point: target, settled: true };
        shownRef.current.set(clientId, next.point);
        const el = elsRef.current.get(clientId);
        if (el) el.style.transform = `translate(${next.point.x}px, ${next.point.y}px)`;
        if (!next.settled) animating = true;
      });

      if (animating) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        lastFrameRef.current = 0;
      }
    };

    const kick = () => {
      if (rafRef.current !== null) return;
      lastFrameRef.current = 0;
      rafRef.current = requestAnimationFrame(step);
    };

    const sync = () => {
      const roster: PeerCursorIdentity[] = [];
      const targets = new Map<number, Point>();

      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const cursor = state.cursor as CursorState | null | undefined;
        if (!cursor) return;
        const playerId = state.playerId as string | undefined;
        const playerMap = playerId && yDoc ? yDoc.getMap(YDOC_PLAYER(playerId)) : null;
        const yjsName = playerMap?.get(YSTATE_PLAYER_NAME) as string | undefined;
        const yjsColor = playerMap?.get(YSTATE_PLAYER_COLOR) as string | undefined;
        roster.push({
          clientId,
          name: yjsName ?? (state.name as string | undefined) ?? `peer-${clientId}`,
          color: yjsColor ?? colorFromPlayerId(playerId ?? String(clientId)),
        });
        targets.set(clientId, { x: cursor.x, y: cursor.y });
      });

      targetsRef.current = targets;
      shownRef.current.forEach((_, clientId) => {
        if (!targets.has(clientId)) shownRef.current.delete(clientId);
      });
      setPeers((prev) => (sameRoster(prev, roster) ? prev : roster));
      kick();
    };

    // `setLocalStateField` fires 'change' for our own updates too. Without this
    // guard our own cursor — which the sync then filters out anyway — would
    // drive a full sync at pointer rate even when alone in the room.
    const onAwarenessChange = (_changes: unknown, origin: unknown) => {
      if (origin === 'local') return;
      sync();
    };
    // Names and colors live in the Yjs doc, not in awareness, so a rename would
    // otherwise not reach the roster until that peer next moved their cursor.
    const onDocUpdate = () => sync();

    awareness.on('change', onAwarenessChange);
    yDoc?.on('update', onDocUpdate);
    sync();

    return () => {
      awareness.off('change', onAwarenessChange);
      yDoc?.off('update', onDocUpdate);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [awareness, yDoc]);

  return { peers, registerCursorEl };
}
