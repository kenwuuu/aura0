/**
 * ActionLogPanel
 *
 * A collapsible, fixed-position chat-box-style panel that renders the shared
 * action history. Read-only for now; the same Y.Array will carry
 * `type: 'message'` entries when a chat composer is added later.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import * as Y from 'yjs';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';
import { DiceControls } from '@/features/dice/DiceControls';
import { useActionLog } from './useActionLog';
import { useDraggablePanel } from '@/shared/ui/useDraggablePanel';

interface ActionLogPanelProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ActionLogPanel({ yDoc, localPlayerId }: ActionLogPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const entries = useActionLog(yDoc);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Default position matches the panel's former fixed spot.
  const { containerRef, position, handleProps } = useDraggablePanel('action-log', { x: 8, y: 48 });

  // Auto-scroll to the newest entry whenever the list grows.
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, isOpen]);

  return (
    <div
      ref={containerRef}
      data-floating-panel="action-log"
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        width: 280,
        // Below the shared Dialog overlay (z-50) so pile-viewer/settings
        // modals visually cover this panel instead of floating above them.
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        background: 'rgba(18,18,24,0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header doubles as the drag handle; the chevron toggles collapse. */}
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

      {/* Entry list */}
      {isOpen && (
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
                      {name}
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
      )}

      {isOpen && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <DiceControls yDoc={yDoc} localPlayerId={localPlayerId} />
        </div>
      )}

      {/* Future: message composer goes here */}
    </div>
  );
}
