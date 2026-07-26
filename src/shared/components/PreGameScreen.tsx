import type { ReactNode } from 'react';

/**
 * The full-viewport shell for a screen that renders *instead of* the game.
 *
 * These screens mount before the game tree exists — before the toolbar, the
 * stores, and any Radix provider — so they deliberately carry their own styles
 * and depend on nothing. Anything reaching for app chrome here belongs in the
 * game tree instead.
 */
export function PreGameScreen({
  title,
  children,
  'data-testid': testId,
}: {
  title: string;
  children?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="full-viewport-height"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        color: '#e5e5e5',
        background: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>{title}</h1>
      {children}
    </div>
  );
}

/** Muted supporting copy under a {@link PreGameScreen} title. */
export function PreGameSubtitle({ children }: { children: ReactNode }) {
  return (
    <p style={{ marginBottom: 16, color: '#a3a3a3', maxWidth: 420, fontSize: 14 }}>{children}</p>
  );
}
