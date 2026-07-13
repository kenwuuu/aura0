import { memo } from 'react';
import { PeerCursor } from './PeerCursor';
import type { PeerCursorIdentity } from '../usePeerCursors';

interface PeerCursorLayerProps {
  peers: PeerCursorIdentity[];
  registerCursorEl: (clientId: number, el: HTMLElement | null) => void;
}

/**
 * The peer-cursor overlay, memoized against the board.
 *
 * `usePeerCursors` writes each cursor's `transform` directly to its element, so
 * this only ever needs to re-render when the roster itself changes — someone
 * joins, leaves, or is renamed. Memoizing keeps a board re-render (a peer
 * dragging a card, say) from detaching and re-attaching every cursor's ref at
 * pointer rate.
 */
export const PeerCursorLayer = memo(function PeerCursorLayer({
  peers,
  registerCursorEl,
}: PeerCursorLayerProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {peers.map((p) => (
        <div
          key={p.clientId}
          data-testid="peer-cursor"
          data-client-id={p.clientId}
          ref={(el) => registerCursorEl(p.clientId, el)}
          style={{ position: 'absolute', willChange: 'transform' }}
        >
          <PeerCursor color={p.color} name={p.name} />
        </div>
      ))}
    </div>
  );
});
