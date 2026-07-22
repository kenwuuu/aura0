import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalGate, MoxfieldGate } from './moxfieldGate';

/**
 * The gate is the only thing keeping Aura under the one-request-per-second cap
 * Moxfield attached to its approved User-Agent, and the penalty for exceeding it
 * is the credential being revoked for every player. So these tests are about one
 * property above all: **two callers must never be granted the same slot.**
 *
 * Time is faked rather than waited on — a real 1s interval would make this suite
 * slower than everything else combined, and the arithmetic is what's under test.
 */
describe('MoxfieldGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function reserve(gate: MoxfieldGate) {
    return (await gate.fetch()).json() as Promise<
      { granted: true; waitMs: number } | { granted: false; retryAfterMs: number }
    >;
  }

  it('grants the first request immediately', async () => {
    expect(await reserve(new MoxfieldGate())).toEqual({ granted: true, waitMs: 0 });
  });

  it('spaces consecutive grants one second apart', async () => {
    const gate = new MoxfieldGate();

    expect(await reserve(gate)).toEqual({ granted: true, waitMs: 0 });
    expect(await reserve(gate)).toEqual({ granted: true, waitMs: 1000 });
    expect(await reserve(gate)).toEqual({ granted: true, waitMs: 2000 });
  });

  /**
   * The reservation has to be spent at grant time, not when the caller actually
   * fetches. If the clock only advanced on use, every request arriving in the
   * same tick would be told to go at once — which is precisely the burst the cap
   * forbids.
   */
  it('never hands the same slot to two callers in the same instant', async () => {
    const gate = new MoxfieldGate();

    const waits = await Promise.all([reserve(gate), reserve(gate), reserve(gate)]);
    const granted = waits.filter((w) => w.granted).map((w) => (w.granted ? w.waitMs : -1));

    expect(new Set(granted).size).toBe(granted.length);
  });

  it('declines rather than queueing past the wait ceiling', async () => {
    const gate = new MoxfieldGate();

    // Four grants fill 0s, 1s, 2s, 3s. The fifth would wait 4s, past the ceiling.
    for (let i = 0; i < 4; i++) {
      expect((await reserve(gate)).granted).toBe(true);
    }

    expect(await reserve(gate)).toEqual({ granted: false, retryAfterMs: 4000 });
  });

  /**
   * A declined request must not advance the clock. If it did, a burst of traffic
   * would push the next legitimate request further and further out — the queue
   * would poison itself and the gate would stop granting anything.
   */
  it('does not spend budget on a request it declined', async () => {
    const gate = new MoxfieldGate();
    for (let i = 0; i < 4; i++) {
      await reserve(gate);
    }

    const firstRefusal = await reserve(gate);
    const secondRefusal = await reserve(gate);

    expect(firstRefusal).toEqual(secondRefusal);
  });

  it('refills as time passes', async () => {
    const gate = new MoxfieldGate();
    await reserve(gate);

    vi.advanceTimersByTime(5000);

    expect(await reserve(gate)).toEqual({ granted: true, waitMs: 0 });
  });
});

/**
 * The dev-server gate has to enforce the same cap: it runs against the *same*
 * Moxfield credential production uses, and Moxfield cannot tell a developer's
 * laptop from a player.
 */
describe('createLocalGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces grants exactly like the Durable Object', () => {
    const gate = createLocalGate();

    expect(gate.reserve()).toEqual({ granted: true, waitMs: 0 });
    expect(gate.reserve()).toEqual({ granted: true, waitMs: 1000 });
  });

  it('declines past the wait ceiling', () => {
    const gate = createLocalGate();
    for (let i = 0; i < 4; i++) {
      gate.reserve();
    }

    expect(gate.reserve()).toEqual({ granted: false, retryAfterMs: 4000 });
  });
});
