import { describe, it, expect } from 'vitest';
import { SENTRY_TUNNEL_PATH, sentryTunnelOption } from './sentryTunnel';

describe('sentryTunnelOption', () => {
  it('tunnels in production', () => {
    expect(sentryTunnelOption(true)).toBe(SENTRY_TUNNEL_PATH);
  });

  /**
   * Only the Worker serves this path. Under `vite` the SPA fallback answers
   * `/api/diag` with index.html and a 200, which the SDK would read as a
   * successful send — silently dropping every local error.
   */
  it('never tunnels outside production', () => {
    expect(sentryTunnelOption(false)).toBeUndefined();
  });

  /**
   * The path is matched against ad-blocker filter lists, which key on
   * substrings. If someone renames it to something descriptive, the tunnel
   * gets blocked and the feature quietly stops working for the exact users it
   * was built for.
   */
  it('uses a path that common filter lists do not match', () => {
    expect(SENTRY_TUNNEL_PATH).not.toMatch(/sentry|monitor|telemetry|analytic|collect|ingest|track/i);
    expect(SENTRY_TUNNEL_PATH.startsWith('/api/')).toBe(true);
  });
});
