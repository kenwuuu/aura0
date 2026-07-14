/**
 * Fallback UI for the root Sentry.ErrorBoundary in main.ts. Without this, a
 * post-boot render crash (anything thrown by <App> after mount, not caught by
 * bootstrapGame()'s own try/catch) leaves a blank white screen with no
 * recovery path — Sentry still captures the exception, but the user sees
 * nothing and has no way to recover short of guessing to refresh.
 */
export function CrashFallback({ eventId }: { eventId?: string }) {
  return (
    <div
      className="full-viewport-height"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        color: 'var(--text)',
        background: 'var(--bg)',
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong.</h1>
      <p style={{ marginBottom: 16, color: 'var(--text-dim)', maxWidth: 420 }}>
        Aura hit an unexpected error and couldn't continue. Reloading usually fixes it.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid var(--line-2)',
          background: 'var(--surface)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
      {eventId && (
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-mute)' }}>Error ID: {eventId}</p>
      )}
    </div>
  );
}
