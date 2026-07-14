import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearDocument } from 'y-indexeddb';
import { ROOM_DOC_MAX_AGE_MS } from '@/constants';
import { purgeExpiredRoomDocs, touchRoom } from './roomDocStorage';

// The IndexedDB layer is a true I/O boundary, and it's the one we must never let this module
// misuse: every assertion below is about *which database names* the collector asks to delete.
vi.mock('y-indexeddb', () => ({
  clearDocument: vi.fn(),
  IndexeddbPersistence: vi.fn(),
}));

const REGISTRY_KEY = 'aura:rooms';

const DAY = 24 * 60 * 60 * 1000;

/** Names the collector actually asked IndexedDB to delete this test. */
function deletedDbs(): string[] {
  return vi.mocked(clearDocument).mock.calls.map(([name]) => name);
}

function seedRegistry(entries: Record<string, number>): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
}

function readRegistry(): Record<string, number> {
  return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '{}');
}

/** Pretend these databases exist on the origin, the way `indexedDB.databases()` would report. */
function givenDatabasesOnDisk(names: string[]): void {
  vi.stubGlobal('indexedDB', {
    ...globalThis.indexedDB,
    databases: vi.fn().mockResolvedValue(names.map((name) => ({ name, version: 1 }))),
  });
}

describe('purgeExpiredRoomDocs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(clearDocument).mockClear();
    givenDatabasesOnDisk([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never deletes the deck library, even when every room has expired', async () => {
    // aura-decks holds every deck the player has ever saved (DeckStorageService). A collector
    // that deletes "anything it doesn't recognize" would wipe someone's collection. This is the
    // test that must never go green for the wrong reason.
    const ancient = Date.now() - 400 * DAY;
    seedRegistry({ 'mtg-oldroom': ancient });
    givenDatabasesOnDisk(['mtg-oldroom', 'aura-decks', 'some-other-app-db']);

    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual(['mtg-oldroom']);
    expect(deletedDbs()).not.toContain('aura-decks');
    expect(deletedDbs()).not.toContain('some-other-app-db');
  });

  it('still does not delete the deck library a year later', async () => {
    // The slow-burn version of the bug above: if the deck library were ever *adopted*, the
    // grace period would hide the damage for a month and then delete it. Nothing touches
    // aura-decks on the room registry's behalf, so an adopted deck library is a doomed one.
    // A single-pass assertion cannot see this; only time travel can.
    givenDatabasesOnDisk(['aura-decks']);

    await purgeExpiredRoomDocs('mtg-current');
    vi.setSystemTime(Date.now() + 365 * DAY);
    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual([]);
    vi.useRealTimers();
  });

  it('never deletes the room being played, however stale its stamp looks', async () => {
    seedRegistry({ 'mtg-current': Date.now() - 400 * DAY });

    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual([]);
    expect(readRegistry()).toHaveProperty('mtg-current');
  });

  it('adopts a room doc it has never seen instead of deleting it on sight', async () => {
    // A player who already has rooms on disk when this ships must not lose them the moment
    // the collector first runs. Strangers get stamped, and a full TTL of grace.
    givenDatabasesOnDisk(['mtg-preexisting']);

    const result = await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual([]);
    expect(result.adopted).toBe(1);
    expect(readRegistry()['mtg-preexisting']).toBeCloseTo(Date.now(), -3);
  });

  it('collects an adopted room once it actually goes cold', async () => {
    givenDatabasesOnDisk(['mtg-preexisting']);
    await purgeExpiredRoomDocs('mtg-current');
    expect(deletedDbs()).toEqual([]);

    // Same database, one TTL later.
    vi.setSystemTime(Date.now() + ROOM_DOC_MAX_AGE_MS + DAY);
    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual(['mtg-preexisting']);
    expect(readRegistry()).not.toHaveProperty('mtg-preexisting');
    vi.useRealTimers();
  });

  it('keeps a room that is merely idle, not abandoned', async () => {
    seedRegistry({ 'mtg-recent': Date.now() - (ROOM_DOC_MAX_AGE_MS - DAY) });

    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual([]);
    expect(readRegistry()).toHaveProperty('mtg-recent');
  });

  it('does not adopt databases that are not rooms', async () => {
    givenDatabasesOnDisk(['aura-decks', 'keyval-store']);

    const result = await purgeExpiredRoomDocs('mtg-current');

    expect(result.adopted).toBe(0);
    expect(readRegistry()).not.toHaveProperty('aura-decks');
  });

  it('survives a browser that cannot enumerate databases (Firefox)', async () => {
    // Firefox does not implement indexedDB.databases(). Adoption is best-effort by design:
    // we under-adopt (leak) rather than over-adopt (delete someone's game).
    vi.stubGlobal('indexedDB', { ...globalThis.indexedDB, databases: undefined });
    seedRegistry({ 'mtg-old': Date.now() - 400 * DAY });

    const result = await purgeExpiredRoomDocs('mtg-current');

    // Registered rooms are still collected; only adoption is skipped.
    expect(result.adopted).toBe(0);
    expect(deletedDbs()).toEqual(['mtg-old']);
  });

  it('does not fail the boot when storage misbehaves', async () => {
    vi.stubGlobal('indexedDB', {
      ...globalThis.indexedDB,
      databases: vi.fn().mockRejectedValue(new Error('SecurityError')),
    });

    await expect(purgeExpiredRoomDocs('mtg-current')).resolves.toEqual({
      purged: 0,
      adopted: 0,
      tracked: 0,
    });
  });

  it('ignores a corrupt registry rather than stranding every room behind it', async () => {
    localStorage.setItem(REGISTRY_KEY, 'not json{');

    await expect(purgeExpiredRoomDocs('mtg-current')).resolves.toMatchObject({ purged: 0 });
    expect(deletedDbs()).toEqual([]);
  });
});

describe('touchRoom', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(clearDocument).mockClear();
    givenDatabasesOnDisk([]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rescues a room from collection by marking it opened', async () => {
    seedRegistry({ 'mtg-stale': Date.now() - 400 * DAY });

    touchRoom('mtg-stale');
    await purgeExpiredRoomDocs('mtg-current');

    expect(deletedDbs()).toEqual([]);
  });
});
