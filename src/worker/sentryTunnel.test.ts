import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSentryTunnel, isSentryTunnelRequest } from './sentryTunnel';

const OUR_DSN =
  'https://beb5f109e66475063b4650877bc1c6a1@o4510353682006016.ingest.de.sentry.io/4510353685610576';
const INGEST_URL =
  'https://o4510353682006016.ingest.de.sentry.io/api/4510353685610576/envelope/';

/**
 * A Sentry envelope: a JSON header line, then newline-delimited items. The
 * item payload is deliberately non-UTF8 in some tests — replay recordings
 * arrive gzipped, and a `text()` round-trip through the tunnel would corrupt
 * them.
 */
function envelope(header: object, itemBytes = new Uint8Array([0x7b, 0x7d])): Uint8Array {
  const headerBytes = new TextEncoder().encode(`${JSON.stringify(header)}\n`);
  const itemHeader = new TextEncoder().encode('{"type":"event"}\n');
  const out = new Uint8Array(headerBytes.length + itemHeader.length + itemBytes.length);
  out.set(headerBytes, 0);
  out.set(itemHeader, headerBytes.length);
  out.set(itemBytes, headerBytes.length + itemHeader.length);
  return out;
}

function post(body: Uint8Array, headers: Record<string, string> = {}): Request {
  // `.slice()` hands `Request` a plain ArrayBuffer, which is what BodyInit accepts.
  return new Request('https://aura0.app/api/diag', {
    method: 'POST',
    body: body.slice().buffer as ArrayBuffer,
    headers,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isSentryTunnelRequest', () => {
  it('matches only the exact tunnel path', () => {
    expect(isSentryTunnelRequest('/api/diag')).toBe(true);
    expect(isSentryTunnelRequest('/api/deck-import')).toBe(false);
    expect(isSentryTunnelRequest('/')).toBe(false);
  });
});

describe('handleSentryTunnel', () => {
  it('forwards our own envelopes to the EU ingest endpoint', async () => {
    const response = await handleSentryTunnel(post(envelope({ dsn: OUR_DSN })));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(INGEST_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/x-sentry-envelope');
  });

  /**
   * Replay recordings are gzipped binary. Decoding the body to text on the way
   * through would corrupt them, and the corruption would only ever show up as
   * replays quietly failing to appear in Sentry.
   */
  it('forwards the raw bytes without a text round-trip', async () => {
    const gzipMagic = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe]);
    const body = envelope({ dsn: OUR_DSN }, gzipMagic);

    await handleSentryTunnel(post(body));

    const sent: Uint8Array = fetchMock.mock.calls[0][1].body;
    expect(Array.from(sent)).toEqual(Array.from(body));
  });

  it('passes the real client IP upstream', async () => {
    await handleSentryTunnel(post(envelope({ dsn: OUR_DSN }), { 'CF-Connecting-IP': '203.0.113.7' }));

    expect(fetchMock.mock.calls[0][1].headers['x-forwarded-for']).toBe('203.0.113.7');
  });

  it("returns Sentry's own status so the SDK can back off", async () => {
    fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429 }));

    const response = await handleSentryTunnel(post(envelope({ dsn: OUR_DSN })));

    expect(response.status).toBe(429);
  });

  /**
   * The open-proxy guard. Without it, anyone who found this path could relay
   * payloads to any Sentry org through aura0.app, on our quota and our name.
   */
  it('refuses envelopes addressed to somebody else’s project', async () => {
    const foreign = 'https://key@o999.ingest.de.sentry.io/999';

    const response = await handleSentryTunnel(post(envelope({ dsn: foreign })));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a DSN for the right host but the wrong project', async () => {
    const wrongProject = 'https://key@o4510353682006016.ingest.de.sentry.io/111';

    const response = await handleSentryTunnel(post(envelope({ dsn: wrongProject })));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an envelope with no DSN header', async () => {
    const response = await handleSentryTunnel(post(envelope({ sent_at: 'now' })));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an envelope at all', async () => {
    const response = await handleSentryTunnel(post(new TextEncoder().encode('not json')));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty body', async () => {
    const response = await handleSentryTunnel(post(new Uint8Array()));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects anything but POST', async () => {
    const response = await handleSentryTunnel(
      new Request('https://aura0.app/api/diag', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
