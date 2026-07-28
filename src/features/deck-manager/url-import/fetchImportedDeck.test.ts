import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import posthog from 'posthog-js';
import { fetchImportedDeck } from './fetchImportedDeck';
import { DeckUrlRef } from './deckUrls';
import { ImportedDeck } from './importedDeck';

// Mock posthog-js rather than our own wrapper, so the analytics call really runs
// and the properties it builds are what the assertions see.
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

const REF: DeckUrlRef = { source: 'moxfield', deckId: 'j-0aJlxuOUm9FnKRvJcfZw' };

const DECK: ImportedDeck = {
  name: 'Winota: Snowball Stax',
  source: 'moxfield',
  cards: [{ name: 'Sol Ring', quantity: 1, section: 'main' }],
};

function ok(): Response {
  return new Response(JSON.stringify(DECK), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function shed(retryAfterSeconds?: string): Response {
  return new Response(JSON.stringify({ error: 'Moxfield imports are busy right now.' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      ...(retryAfterSeconds === undefined ? {} : { 'retry-after': retryAfterSeconds }),
    },
  });
}

const captures = () => (posthog.capture as unknown as Mock).mock.calls;

describe('fetchImportedDeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * Moxfield imports share one request per second across every player, so two
   * people importing different decks in the same second is ordinary traffic.
   * The endpoint says how long to wait; waiting keeps that invisible.
   */
  it('retries once after a 429 and succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(shed('2')).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchImportedDeck(REF);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toMatchObject({ name: 'Winota: Snowball Stax' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waits the interval the endpoint asked for before retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(shed('3')).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchImportedDeck(REF);

    await vi.advanceTimersByTimeAsync(2500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await promise;
  });

  /**
   * A second 429 means the queue is genuinely saturated. Retrying into it would
   * make things worse for everyone already waiting.
   */
  it('gives up after a second 429 rather than retrying again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(shed('1'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchImportedDeck(REF);
    const assertion = expect(promise).rejects.toThrow(/busy right now/i);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /** Retrying on a guess would spend a slot we were never promised. */
  it('does not retry a 429 that carries no Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue(shed());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchImportedDeck(REF);
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /** A `Retry-After` is a number from a server; an absurd one must not strand the UI. */
  it('caps an unreasonable Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(shed('3600')).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchImportedDeck(REF);
    await vi.advanceTimersByTimeAsync(6000);

    await expect(promise).resolves.toMatchObject({ name: 'Winota: Snowball Stax' });
  });

  /**
   * The endpoint has already turned the deck site's answer into a reason and
   * the fixes for it. Re-deriving that here from a status code would only be a
   * worse guess, so the explanation travels intact to the dialog.
   */
  it('carries the endpoint’s explanation and its fixes through to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Aura couldn’t find that deck on Moxfield.',
            reason: 'deck_not_found',
            fixes: ['Open the link in a new tab.', 'Or make the deck public.'],
            detail: 'Moxfield replied with status 404.',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(fetchImportedDeck(REF)).rejects.toMatchObject({
      problem: {
        reason: 'deck_not_found',
        message: 'Aura couldn’t find that deck on Moxfield.',
        fixes: ['Open the link in a new tab.', 'Or make the deck public.'],
        detail: 'Moxfield replied with status 404.',
      },
    });
  });

  /** The player closed the dialog. Waiting out a retry must not outlive that. */
  it('abandons the retry wait when the caller aborts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(shed('5'));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const promise = fetchImportedDeck(REF, controller.signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('telemetry', () => {
    it('reports one event for a retried import, not two', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(shed('1')).mockResolvedValueOnce(ok()),
      );

      const promise = fetchImportedDeck(REF);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      const events = captures().filter(([name]) => name === 'deck_url_import');
      expect(events).toHaveLength(1);
      expect(events[0][1]).toMatchObject({
        source: 'moxfield',
        deck_id: 'j-0aJlxuOUm9FnKRvJcfZw',
        outcome: 'succeeded',
      });
    });

    /**
     * A successful retry looks identical to a request that never waited, so
     * without this flag the gate could be shedding constantly and nothing would
     * show it. This is what says whether one request per second is enough.
     */
    it('records that a retried import was rate limited, even though it succeeded', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(shed('1')).mockResolvedValueOnce(ok()),
      );

      const promise = fetchImportedDeck(REF);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(captures().find(([name]) => name === 'deck_url_import')![1]).toMatchObject({
        outcome: 'succeeded',
        was_rate_limited: true,
      });
    });

    it('records an unimpeded import as not rate limited', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));

      await fetchImportedDeck(REF);

      expect(captures().find(([name]) => name === 'deck_url_import')![1]).toMatchObject({
        was_rate_limited: false,
      });
    });

    /**
     * A binary succeeded/failed metric cannot tell "somebody pasted a private
     * deck" — inherent, and unfixable in code — from "the adapter broke", which
     * is ours and worth alerting on. That is what made Archidekt's headline 18%
     * failure rate untrustworthy in #174.
     */
    it('records why a failed import failed', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: 'Aura couldn’t find that deck on Moxfield.',
              reason: 'deck_not_found',
              fixes: ['Open the link in a new tab.'],
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
        ),
      );

      await expect(fetchImportedDeck(REF)).rejects.toThrow();

      expect(captures().find(([name]) => name === 'deck_url_import')![1]).toMatchObject({
        outcome: 'failed',
        failure_reason: 'deck_not_found',
      });
    });

    /** A blocked or offline request never reached us, let alone the deck site. */
    it('separates a failure to reach Aura from a failure at the deck site', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      await expect(fetchImportedDeck(REF)).rejects.toThrow();

      expect(captures().find(([name]) => name === 'deck_url_import')![1]).toMatchObject({
        outcome: 'failed',
        failure_reason: 'aura_unreachable',
      });
    });

    it('records no reason on a success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));

      await fetchImportedDeck(REF);

      expect(
        captures().find(([name]) => name === 'deck_url_import')![1],
      ).not.toHaveProperty('failure_reason');
    });

    /** An abort never reached the network, so it spent no rate budget to record. */
    it('reports nothing when the caller aborts', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      );

      await expect(fetchImportedDeck(REF)).rejects.toMatchObject({ name: 'AbortError' });

      expect(captures().filter(([name]) => name === 'deck_url_import')).toHaveLength(0);
    });
  });
});
