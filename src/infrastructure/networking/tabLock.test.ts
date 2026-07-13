import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireTabLock, onTabTakeoverRequest, tabLockKey, takeTabLock } from './tabLock';

/**
 * A minimal Web Locks implementation: exclusive, and — the property the takeover
 * flow leans on — grants in request order, so a tab that queues before the holder
 * releases gets the lock ahead of anyone who asks later.
 */
class FakeLockManager {
  private held = new Set<string>();
  private waiters = new Map<string, Array<() => void>>();

  async request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => unknown,
  ): Promise<unknown> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null);
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(name) ?? [];
        queue.push(resolve);
        this.waiters.set(name, queue);
      });
    }

    this.held.add(name);
    try {
      return await callback({ name });
    } finally {
      this.held.delete(name);
      this.waiters.get(name)?.shift()?.();
    }
  }
}

const KEY = tabLockKey('mtg-test', 'player-1');

/** Let queued microtasks and BroadcastChannel deliveries settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let originalLocks: unknown;

beforeEach(() => {
  originalLocks = (navigator as unknown as { locks?: unknown }).locks;
  Object.defineProperty(navigator, 'locks', {
    value: new FakeLockManager(),
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'locks', { value: originalLocks, configurable: true });
  vi.useRealTimers();
});

describe('tabLockKey', () => {
  it('scopes the lock to a room, so two rooms can be open side by side', () => {
    expect(tabLockKey('room-a', 'player-1')).not.toBe(tabLockKey('room-b', 'player-1'));
  });

  it('scopes the lock to a player, so two players never contend', () => {
    expect(tabLockKey('room-a', 'player-1')).not.toBe(tabLockKey('room-a', 'player-2'));
  });
});

describe('acquireTabLock', () => {
  it('grants the room to the first tab and refuses the second', async () => {
    const first = await acquireTabLock(KEY);
    expect(first).not.toBeNull();

    expect(await acquireTabLock(KEY)).toBeNull();
  });

  it('frees the room once the holding tab releases it', async () => {
    const first = await acquireTabLock(KEY);
    first!.release();
    await settle();

    expect(await acquireTabLock(KEY)).not.toBeNull();
  });

  it('does not lock out a browser without the Web Locks API', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });

    // Can't enforce one-tab-per-room here, and refusing to boot would be worse
    // than the duplicate tab we're trying to prevent.
    expect(await acquireTabLock(KEY)).not.toBeNull();
    expect(await acquireTabLock(KEY)).not.toBeNull();
  });
});

describe('takeTabLock', () => {
  it('asks the holding tab to stand down, and takes the room when it does', async () => {
    const holder = await acquireTabLock(KEY);
    const stoodDown = vi.fn(() => holder!.release());
    onTabTakeoverRequest(KEY, stoodDown);

    const taken = await takeTabLock(KEY);

    expect(stoodDown).toHaveBeenCalledOnce();
    expect(taken).not.toBeNull();
  });

  it('wins the lock ahead of the yielding tab, which re-requests as it reloads', async () => {
    const holder = await acquireTabLock(KEY);
    // A yielding tab releases and then reloads, and a reload re-requests the
    // lock. Web Locks grant in request order, so the taker — who queued first —
    // must still win, or the two tabs would trade the room back and forth.
    onTabTakeoverRequest(KEY, () => {
      holder!.release();
      void acquireTabLock(KEY);
    });

    const taken = await takeTabLock(KEY);
    await settle();

    expect(taken).not.toBeNull();
    // The reloading tab now finds the room taken, and shows the duplicate-tab screen.
    expect(await acquireTabLock(KEY)).toBeNull();
  });

  it('gives up rather than hanging when the other tab never answers', async () => {
    await acquireTabLock(KEY); // holder that never listens for takeover requests

    await expect(takeTabLock(KEY)).rejects.toThrow(/did not respond/i);
  }, 10_000);
});
