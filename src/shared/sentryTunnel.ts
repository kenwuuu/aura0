/**
 * Where Sentry telemetry enters our own origin, and how much of it does.
 *
 * Dependency-free on purpose: the Cloudflare Worker imports this file too (see
 * `src/worker/sentryTunnel.ts`), and anything this module pulls in would land
 * in the Worker bundle with it.
 */

/**
 * The tunnel's public path.
 *
 * The blandness is load-bearing. Ad-blocker filter lists match on substrings,
 * and `/sentry`, `/monitoring`, `/telemetry`, `/collect` and `/ingest` are all
 * blocked by common lists — any of them would defeat the entire point of
 * running a first-party tunnel. Do not "clarify" this name to something more
 * descriptive.
 *
 * It sits under `/api/` so it is covered by the single `run_worker_first`
 * pattern in wrangler.jsonc rather than needing one of its own.
 */
export const SENTRY_TUNNEL_PATH = '/api/diag';

export type SentryTunnelScope = 'all' | 'off';

/**
 * How much Sentry traffic goes through the Worker.
 *
 * - `'all'` — every envelope: errors, traces, replays, logs, bug reports.
 *   Ad-blocked players stop being invisible, which is the whole point: they are
 *   over-represented among people hitting the weird bugs, and today they report
 *   nothing at all.
 * - `'off'` — nothing. The SDK talks to Sentry directly, exactly as it did
 *   before this existed. Flip this and redeploy if Worker request volume
 *   becomes a problem; nothing else has to change.
 *
 * There is deliberately no "only bug reports" setting. Sentry's `tunnel` option
 * is all-or-nothing by design, so routing a subset means replacing the SDK's
 * transport — and a transport bug loses telemetry *silently*, which is the
 * worst failure mode this codebase can have. The dials that actually reduce
 * volume, and reduce Sentry cost along with it, are `replaysSessionSampleRate`
 * and `tracesSampleRate` in `main.ts`.
 */
export const SENTRY_TUNNEL_SCOPE: SentryTunnelScope = 'all';

/**
 * The `tunnel` value for `Sentry.init`, or `undefined` to ship direct.
 *
 * A relative path is correct: the SDK resolves it against the current origin,
 * so staging tunnels through staging and production through production without
 * either needing to know its own hostname.
 *
 * `isProduction` is threaded in by the caller rather than read from
 * `import.meta.env` here, because this module is also bundled into the
 * Cloudflare Worker (see `src/worker/sentryTunnel.ts`) where `import.meta.env`
 * does not exist.
 *
 * Dev and test never tunnel. Only the Worker serves this path — under `vite`
 * the SPA fallback would answer `/api/diag` with `index.html` and a `200`, and
 * the SDK would read that as a successful send and silently drop every local
 * error. A telemetry pipe that fails loudly is fine; one that reports success
 * while dropping data is the failure mode worth engineering against.
 */
export function sentryTunnelOption(isProduction: boolean): string | undefined {
  if (!isProduction) return undefined;
  return SENTRY_TUNNEL_SCOPE === 'all' ? SENTRY_TUNNEL_PATH : undefined;
}
