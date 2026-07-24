/**
 * ActionLogPanel
 *
 * A collapsible, draggable, chat-box-style panel that renders the shared action
 * history. The same Y.Array carries `type: 'message'` chat entries alongside
 * game-action entries, appended via the composer at the bottom of the panel.
 *
 * The draggable window frame is FloatingPanel; the header (icon + label +
 * collapse toggle) is supplied as its custom handle. Keeping the drag state in
 * FloatingPanel means a drag re-renders only the frame, not this panel's entry
 * list — see FloatingPanel's note. The contents themselves are exported as
 * ActionLogBody so the phone HUD stack can host them without the frame.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import * as Y from 'yjs';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';
import { DiceControls } from '@/features/dice/DiceControls';
import { FloatingPanel } from '@/shared/ui/FloatingPanel';
import { useActionLog } from './useActionLog';
import { ActionLogComposer } from './ActionLogComposer';

interface ActionLogPanelProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The log's contents: entry list + dice controls. Host-agnostic — the desktop
 * draggable panel and the phone HUD stack both render it; it mounts only
 * while its host is open, so the auto-scroll effect fires on mount and on
 * every new entry.
 */
export function ActionLogBody({ yDoc, localPlayerId }: ActionLogPanelProps) {
  const entries = useActionLog(yDoc);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest entry whenever the list grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <>
      <ScrollArea style={{ height: 200 }}>
        <div style={{ padding: '4px 0' }}>
          {entries.length === 0 ? (
            <p style={{
              color: 'rgba(255,255,255,0.3)',
              fontSize: 12,
              textAlign: 'center',
              padding: '16px 12px',
              margin: 0,
            }}>
              No actions yet
            </p>
          ) : (
            entries.map((entry) => {
              const name = resolvePlayerName(yDoc, entry.actorId);
              const isLocal = entry.actorId === localPlayerId;
              const isMessage = entry.type === 'message';
              return (
                <div
                  key={entry.id}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    lineHeight: '1.4',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span style={{
                    fontWeight: 600,
                    color: isLocal ? 'rgba(130,180,255,0.9)' : 'rgba(200,160,255,1)',
                    marginRight: 4,
                  }}>
                    {isMessage ? `${name}:` : name}
                  </span>
                  <span style={{ color: entry.tone ?? 'rgba(255,255,255,1)' }}>
                    {entry.text}
                  </span>
                  <span style={{
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: 10,
                    marginLeft: 6,
                    whiteSpace: 'nowrap',
                  }}>
                    {formatTime(entry.ts)}
                  </span>
                </div>
              );
            })
          )}
          {/* Sentinel div for auto-scroll */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <DiceControls yDoc={yDoc} localPlayerId={localPlayerId} />
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <ActionLogComposer yDoc={yDoc} localPlayerId={localPlayerId} />
      </div>
    </>
  );
}

export function ActionLogPanel({ yDoc, localPlayerId }: ActionLogPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    // Default position matches the panel's former fixed spot. zIndex stays at
    // FloatingPanel's default (40): below the shared Dialog overlay (z-50) so
    // pile-viewer/settings modals cover this panel instead of it floating above.
    <FloatingPanel
      persistKey="action-log"
      defaultPosition={{ x: 8, y: 48 }}
      width={280}
      renderHandle={(handleProps) => (
        // Header doubles as the drag handle; the chevron toggles collapse.
        <div
          {...handleProps}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderBottom: isOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
            cursor: 'grab',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            userSelect: 'none',
            touchAction: 'none', // let pointer capture own the gesture, don't scroll
          }}
        >
          <ScrollText size={13} strokeWidth={2} />
          <span style={{ flex: 1, textAlign: 'left' }}>Action Log</span>
          <button
            onClick={() => setIsOpen((v) => !v)}
            // Grabbing the chevron must not start a panel drag.
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={isOpen ? 'Collapse action log' : 'Expand action log'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              padding: 0,
            }}
          >
            {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}
    >
      {isOpen && <ActionLogBody yDoc={yDoc} localPlayerId={localPlayerId} />}
    </FloatingPanel>
  );
}
