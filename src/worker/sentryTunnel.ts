import { SENTRY_TUNNEL_PATH } from '../shared/sentryTunnel';

/**
 * The Sentry tunnel: `POST /api/diag` → Sentry's envelope ingest.
 *
 * Why it exists: ad blockers block requests to `*.sentry.io`, and the players
 * most likely to hit a strange bug are over-represented among ad-blocked ones.
 * Today they are invisible — no errors, no bug reports, nothing. Routing
 * ingest through our own origin makes them visible again.
 *
 * Kept as a plain `Request` → `Response` function, apart from the Worker entry
 * point, so it can be unit-tested directly and so the same implementation could
 * be served in dev. It needs nothing but `fetch`, `Request` and `Response`.
 *
 * @see src/shared/sentryTunnel.ts for the path and the scope knob.
 */

/**
 * The one project this tunnel will forward to.
 *
 * Hardcoded rather than read from the envelope: without a fixed target, anyone
 * who found this path could relay arbitrary payloads to arbitrary Sentry orgs
 * through `aura0.app` — an open proxy wearing our domain and burning our
 * Workers quota. Must match the DSN in `main.ts`; note the **EU** ingest host
 * (`.de.`), which a US-region example would get silently wrong.
 */
const SENTRY_INGEST_HOST = 'o4510353682006016.ingest.de.sentry.io';
const SENTRY_PROJECT_ID = '4510353685610576';

const SENTRY_ENVELOPE_URL = `https://${SENTRY_INGEST_HOST}/api/${SENTRY_PROJECT_ID}/envelope/`;

/**
 * Abuse guard only — set far above anything Sentry actually sends. Real replay
 * segments are well under a megabyte; a cap tight enough to trim them would
 * drop replays with no visible symptom, which is worse than the volume it saves.
 */
const MAX_ENVELOPE_BYTES = 20 * 1024 * 1024;

const NEWLINE = 0x0a;

export function isSentryTunnelRequest(pathname: string): boolean {
  return pathname === SENTRY_TUNNEL_PATH;
}

/**
 * The first line of an envelope is its JSON header, which carries the DSN the
 * SDK is sending to.
 *
 * Parsed from the raw bytes rather than by decoding the whole body: replay
 * recording items can be gzipped binary, and a `text()` round-trip would
 * corrupt them on the way through.
 */
function readEnvelopeDsn(body: Uint8Array): string | null {
  const newlineIndex = body.indexOf(NEWLINE);
  if (newlineIndex <= 0) return null;

  try {
    const header: unknown = JSON.parse(new TextDecoder().decode(body.subarray(0, newlineIndex)));
    if (typeof header !== 'object' || header === null) return null;
    const dsn = (header as { dsn?: unknown }).dsn;
    return typeof dsn === 'string' ? dsn : null;
  } catch {
    return null;
  }
}

/** Does this envelope belong to our project? Anything else is somebody using us as a relay. */
function isOurProject(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    // A DSN path is `/<projectId>`; the public key lives in the userinfo, which
    // is not a secret and not what authorizes anything here.
    return url.hostname === SENTRY_INGEST_HOST && url.pathname === `/${SENTRY_PROJECT_ID}`;
  } catch {
    return false;
  }
}

export async function handleSentryTunnel(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = new Uint8Array(await request.arrayBuffer());

  if (body.byteLength === 0) {
    return new Response('Empty envelope', { status: 400 });
  }
  if (body.byteLength > MAX_ENVELOPE_BYTES) {
    return new Response('Envelope too large', { status: 413 });
  }

  const dsn = readEnvelopeDsn(body);
  if (dsn === null) {
    return new Response('Malformed envelope', { status: 400 });
  }
  if (!isOurProject(dsn)) {
    return new Response('Forbidden', { status: 403 });
  }

  const upstream = await fetch(SENTRY_ENVELOPE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-sentry-envelope',
      // Without this every event would carry Cloudflare's egress IP, quietly
      // collapsing Sentry's per-user geo and IP grouping into a handful of
      // datacentres. `sendDefaultPii` is on, so this is data we already collect.
      'x-forwarded-for': request.headers.get('CF-Connecting-IP') ?? '',
    },
    body,
  });

  // Sentry's status (and its rate-limit headers) go straight back to the SDK,
  // which knows how to back off. Swallowing them here would teach the client
  // that a throttled send succeeded.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
