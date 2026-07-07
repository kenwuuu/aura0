/**
 * FloatingPanel — a draggable, desktop-window-style HUD container. Provides the
 * window frame (dark surface + border + blur + shadow) and a drag handle (a
 * title bar with a grip). Only the handle initiates a drag, so interactive
 * content (buttons, inputs) inside the body stays clickable.
 *
 * Reusable across HUD surfaces: the game actions toolbar today, the action-log
 * panel next. Position is clamped to the viewport and persisted per `persistKey`
 * (see useDraggablePanel).
 */
import { type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';
import { useDraggablePanel, type Position } from './useDraggablePanel';

export function FloatingPanel({
  persistKey,
  defaultPosition,
  title,
  zIndex = 40,
  children,
}: {
  /** Stable key for saving/restoring this panel's position. */
  persistKey: string;
  /** Where the panel first appears if nothing is persisted yet. */
  defaultPosition: Position;
  /** Optional label shown in the drag handle. */
  title?: string;
  zIndex?: number;
  children: ReactNode;
}) {
  const { containerRef, position, handleProps } = useDraggablePanel(persistKey, defaultPosition);

  return (
    <div
      ref={containerRef}
      data-floating-panel={persistKey}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex,
        borderRadius: 8,
        background: 'rgba(18,18,24,0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Drag handle */}
      <div
        {...handleProps}
        title="Drag to move"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 18,
          cursor: 'grab',
          color: 'rgba(255,255,255,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.03)',
          userSelect: 'none',
          touchAction: 'none', // let pointer capture own the gesture, don't scroll
        }}
      >
        <GripHorizontal size={12} />
        {title && (
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {title}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}
