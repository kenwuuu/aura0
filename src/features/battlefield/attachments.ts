/**
 * Card→card attachment relationships (aura/equipment/enchantment enchants creature).
 *
 * Unlike token `attachedTo` (spatial stacking — "what is laying on top of this card"),
 * an Attachment is a *declared, persistent* relationship the user draws by hand. It
 * survives the two cards being moved anywhere on the board. Stored in a single Y.Map
 * keyed by attachment id — which is exactly a react-flow edge list.
 */
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Edge, MarkerType } from '@xyflow/react';
import { ATTACHMENT_EDGE_COLOR, ATTACHMENT_EDGE_TYPE } from './edges/AttachmentEdge';

export interface Attachment {
  id: string;
  /** The equipment/aura/enchantment card. */
  source: string;
  /** The creature (or other permanent) it is attached to. */
  target: string;
}

/** Deterministic id so drawing A→B twice is idempotent (last write wins, no dup edge). */
export function attachmentId(source: string, target: string): string {
  return `attach:${source}->${target}`;
}

/** Record a user-drawn attachment. No-op guard for self-links lives at the call site. */
export function createAttachment(
  yAttachments: Y.Map<Attachment>,
  source: string,
  target: string,
): void {
  const id = attachmentId(source, target);
  yAttachments.set(id, { id, source, target });
}

export function removeAttachment(yAttachments: Y.Map<Attachment>, id: string): void {
  yAttachments.delete(id);
}

/** Translate the attachment map into react-flow edges styled as floating attachment lines. */
export function buildAttachmentEdges(yAttachments: Y.Map<Attachment>): Edge[] {
  const edges: Edge[] = [];
  yAttachments.forEach((a) => {
    edges.push({
      id: a.id,
      source: a.source,
      target: a.target,
      type: ATTACHMENT_EDGE_TYPE,
      animated: true,
      // Edges render beneath nodes by default, so the full-canvas playmat (z0)
      // would hide the line. Lift it to z1: above the mat, still under the
      // cards (z2+), so the line tucks neatly under the card art at each end.
      zIndex: 1,
      // className drives all theming from CSS (see attachmentEdge.css) so the
      // redesign can re-skin the line without touching this file.
      className: 'attachment-edge',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: ATTACHMENT_EDGE_COLOR,
        width: 18,
        height: 18,
      },
    });
  });
  return edges;
}

/** Observe the attachment map and return the live react-flow edge list. */
export function useAttachmentEdges(yAttachments: Y.Map<Attachment>): Edge[] {
  const [edges, setEdges] = useState<Edge[]>(() => buildAttachmentEdges(yAttachments));
  useEffect(() => {
    const sync = () => setEdges(buildAttachmentEdges(yAttachments));
    yAttachments.observe(sync);
    sync();
    return () => yAttachments.unobserve(sync);
  }, [yAttachments]);
  return edges;
}
