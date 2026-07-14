/**
 * FloatingPanel — a draggable, desktop-window-style HUD container. Provides the
 * window frame (dark surface + border + blur + shadow) and a drag handle. Only
 * the handle initiates a drag, so interactive content (buttons, inputs) inside
 * the body stays clickable.
 *
 * The handle is either the built-in grip + optional `title`, or a fully custom
 * element supplied via `renderHandle` — for panels whose title bar carries its
 * own controls (e.g. the action log's collapse toggle). Either way the handle
 * is the panel's first child, so it doubles as the drag surface.
 *
 * Keeping the drag state *here* (not in the caller) is what keeps dragging cheap:
 * a pointer move re-renders only FloatingPanel, and `children` — passed by
 * reference from a parent that isn't re-rendering — is skipped by reconciliation.
 * A panel that owns its own drag state instead re-renders its whole body (list,
 * scroll area, etc.) on every pointer move. Custom handles are re-created each
 * frame, so keep them light.
 *
 * Reusable across HUD surfaces: the game actions toolbar and the action-log
 * panel today. Position is clamped to the viewport and persisted per `persistKey`
 * (see useDraggablePanel).
 */
import { type CSSProperties, type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';
import { useDraggablePanel, type DragHandleProps, type Position } from './useDraggablePanel';

/** The HUD window surface (dark + blur + border + shadow). Shared with
 * non-draggable hosts of the same content, e.g. the phone HUD stack. */
export const panelFrameStyle: CSSProperties = {
  borderRadius: 8,
  background: 'rgba(13, 13, 20, 0.92)', /* --bg-2 @ 92% (blur needs alpha) */
  backdropFilter: 'blur(8px)',
  border: '1px solid var(--line-2)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  overflow: 'hidden',
};

export function FloatingPanel({
  persistKey,
  defaultPosition,
  title,
  renderHandle,
  width,
  zIndex = 40,
  children,
}: {
  /** Stable key for saving/restoring this panel's position. */
  persistKey: string;
  /** Where the panel first appears if nothing is persisted yet. */
  defaultPosition: Position;
  /** Optional label shown in the built-in grip handle. Ignored when `renderHandle` is set. */
  title?: string;
  /**
   * Render a fully custom drag handle instead of the built-in grip. The returned
   * element MUST spread the provided `handleProps` onto its root and set
   * `touchAction: 'none'` so the pointer gesture isn't stolen by scrolling.
   * Rendered as the panel's first child. Keep it light — it re-renders on every
   * pointer move during a drag.
   */
  renderHandle?: (handleProps: DragHandleProps) => ReactNode;
  /** Fixed panel width. Omit to size to content (the toolbar's behavior). */
  width?: number | string;
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
        width,
        zIndex,
        ...panelFrameStyle,
      }}
    >
      {renderHandle ? (
        renderHandle(handleProps)
      ) : (
        /* Built-in grip handle */
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
            color: 'var(--text-mute)',
            borderBottom: '1px solid var(--line)',
            background: 'var(--surface)',
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
      )}

      {children}
    </div>
  );
}
