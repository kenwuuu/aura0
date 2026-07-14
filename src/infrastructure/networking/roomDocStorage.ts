/**
 * Room doc storage — registry + garbage collection for the per-room IndexedDB databases.
 *
 * `y-indexeddb` names its database after the room, verbatim: opening room `mtg-a1b2c3d`
 * creates an IndexedDB database literally called `mtg-a1b2c3d`. Room ids are minted fresh
 * per game, so without a collector every game a player ever opens leaves a database behind
 * forever. The cost isn't disk — it's that browsers evict IndexedDB *origin-wide* under
 * storage pressure, so accumulated dead rooms raise the odds the browser throws away the
 * room the player is actually sitting in.
 *
 * ## Deleting a room doc is data loss, not cache eviction
 *
 * The relay installs a no-op persistence (see `networking/websocket/server.js`) and evicts
 * a room from memory once the last client leaves. Nothing server-side is durable. Each
 * client's IndexedDB copy *is* the game. So this collector is deliberately conservative:
 *
 * - A room is only collected after {@link ROOM_DOC_MAX_AGE_MS} of not being opened.
 * - The room being played right now is never collected, however old its stamp looks.
 * - A database we've never seen before is *adopted* (stamped with now), never deleted on
 *   sight. It then ages out through the normal path, giving it a full TTL of grace. This is
 *   what makes shipping the collector safe for players who already have rooms on disk.
 *
 * ## Deletion is an allowlist, never a denylist
 *
 * Other Aura data shares this origin — most importantly `aura-decks`, which holds every deck
 * the player has ever saved (`DeckStorageService`). "Delete any database we don't recognize"
 * would wipe someone's collection. So we only ever delete names that are *in the registry*,
 * and only ever adopt names that look like rooms. Everything else on the origin is untouched.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence, clearDocument } from 'y-indexeddb';
import { ROOM_PREFIX, ROOM_DOC_MAX_AGE_MS } from '@/constants';

/** roomName → epoch ms the room was last opened. */
type RoomRegistry = Record<string, number>;

const REGISTRY_KEY = 'aura:rooms';

/**
 * The recent-rooms list `RoomManager` has always kept. It predates this registry and is
 * capped at 3 entries with no timestamps, but the names in it are known-real rooms — which
 * makes it the one source that can name a *custom* room (`?room=my-game`) that the
 * {@link ROOM_PREFIX} filter can't recognize on its own.
 */
const VISITED_ROOMS_KEY = 'aura-visited-rooms';

function readRegistry(): RoomRegistry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop anything that isn't a name→number pair; a corrupt entry must not strand the rest.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([name, seen]) => typeof name === 'string' && typeof seen === 'number' && Number.isFinite(seen))
    ) as RoomRegistry;
  } catch {
    return {};
  }
}

function writeRegistry(registry: RoomRegistry): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // A full or unavailable localStorage costs us a GC pass, not a boot.
  }
}

/**
 * Record that a room is in use right now. Called whenever a room's persistence is opened,
 * and periodically while it stays open (see {@link keepRoomAlive}).
 */
export function touchRoom(roomName: string): void {
  const registry = readRegistry();
  registry[roomName] = Date.now();
  writeRegistry(registry);
}

/**
 * Open a room's IndexedDB persistence *and* register it, in one step.
 *
 * Providers call this instead of constructing `IndexeddbPersistence` directly, so a room doc
 * cannot be created without the collector knowing about it. A future transport gets the
 * bookkeeping for free rather than having to remember it — an unregistered room doc is
 * exactly the leak this module exists to fix.
 */
export function createRoomPersistence(roomName: string, yDoc: Y.Doc): IndexeddbPersistence {
  touchRoom(roomName);
  return new IndexeddbPersistence(roomName, yDoc);
}

/**
 * Keep re-stamping the open room so a long-lived tab can't have the room out from under it
 * collected by a *different* tab. Without this, a tab parked on a board past the TTL looks
 * abandoned to every other tab in the browser.
 *
 * @returns a cleanup function that stops the heartbeat.
 */
export function keepRoomAlive(roomName: string, intervalMs = 30 * 60 * 1000): () => void {
  const beat = () => touchRoom(roomName);
  const onVisible = () => {
    if (document.visibilityState === 'visible') beat();
  };

  const timer = setInterval(beat, intervalMs);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Does this database name belong to an auto-generated room? */
function looksLikeRoomDb(name: string): boolean {
  return name.startsWith(ROOM_PREFIX);
}

/**
 * Names of room databases currently on disk that the registry has never heard of.
 *
 * `indexedDB.databases()` is unimplemented in Firefox, so this is best-effort by design: where
 * it's missing we simply adopt nothing and rely on rooms registering themselves as they're
 * opened. Under-adopting leaks; over-adopting deletes someone's game. We under-adopt.
 */
async function findUnregisteredRoomDbs(registry: RoomRegistry): Promise<string[]> {
  const names = new Set<string>();

  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    for (const { name } of databases) {
      if (name && looksLikeRoomDb(name)) names.add(name);
    }
  }

  // Rooms RoomManager remembers visiting are real rooms even when custom-named.
  try {
    const visited: unknown = JSON.parse(localStorage.getItem(VISITED_ROOMS_KEY) ?? '[]');
    if (Array.isArray(visited)) {
      for (const name of visited) if (typeof name === 'string' && name) names.add(name);
    }
  } catch {
    // A malformed recent-rooms list just means nothing extra to adopt.
  }

  return [...names].filter((name) => !(name in registry));
}

export interface RoomDocGcResult {
  /** Room docs deleted from IndexedDB this pass. */
  purged: number;
  /** Pre-existing room docs met for the first time and given a full TTL of grace. */
  adopted: number;
  /** Room docs currently tracked, after the pass. */
  tracked: number;
}

/**
 * Collect room docs that haven't been opened in {@link ROOM_DOC_MAX_AGE_MS}.
 *
 * Never throws: a failure here must cost a GC pass, never a boot.
 *
 * @param currentRoomName the room being opened right now — never collected.
 */
export async function purgeExpiredRoomDocs(currentRoomName: string): Promise<RoomDocGcResult> {
  try {
    const registry = readRegistry();
    const now = Date.now();

    // 1. Adopt: stamp strangers with `now` so they expire a full TTL from today rather than
    //    being deleted the moment the collector first lays eyes on them.
    const unregistered = await findUnregisteredRoomDbs(registry);
    for (const name of unregistered) registry[name] = now;

    // 2. Collect: only names the registry vouches for, and never the live room.
    const expired = Object.entries(registry)
      .filter(([name, lastSeen]) => name !== currentRoomName && now - lastSeen > ROOM_DOC_MAX_AGE_MS)
      .map(([name]) => name);

    for (const name of expired) {
      delete registry[name];
      // Deliberately not awaited. `indexedDB.deleteDatabase` *blocks* while another tab holds
      // the database open, so awaiting here would stall boot behind a tab we don't control.
      // The delete stays queued and lands when that tab closes; dropping the registry entry
      // now just means we won't ask twice.
      void Promise.resolve(clearDocument(name)).catch(() => {
        // A database that refuses to go is retried on a future pass only if it's re-registered;
        // either way it must not take the boot down with it.
      });
    }

    writeRegistry(registry);

    return { purged: expired.length, adopted: unregistered.length, tracked: Object.keys(registry).length };
  } catch {
    return { purged: 0, adopted: 0, tracked: 0 };
  }
}
