/**
 * bootstrapGame — imperative app wiring.
 *
 * Wires the game singletons (Y.Doc, networking, Player, services) in dependency
 * order, populates Zustand stores, and returns a GameContext for App.tsx.
 *
 * Deck domain logic lives in features/deck-manager/deckLoading.ts.
 */
import * as Y from 'yjs';
import { Player } from '@/features/player';
import { RoomManager } from '@/features/room';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { yjsNetworkFactory } from '@/infrastructure/networking';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { getOrCreatePlayerId, getOrCreatePeerId } from '@/infrastructure/networking';
import {
  acquireTabLock,
  onTabTakeoverRequest,
  takeTabLock,
  tabLockKey,
} from '@/infrastructure/networking/tabLock';
import { watchRoomOccupancy } from '@/infrastructure/networking/roomOccupancy';
import { purgeExpiredRoomDocs } from '@/infrastructure/networking/roomDocStorage';
import { trackRoomOccupancyChanged, trackRoomDocsPurged } from '@/infrastructure/analytics/PosthogFunctions';
import { DeckPersistenceService, DeckStorageService } from '@/infrastructure/persistence';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { getEffectiveNetworkTransport } from '@/app/stores/settingsStore';
import {
  autoLoadDeckOnStart,
  seedDefaultDeckIfFirstLoad,
} from '@/features/deck-manager/deckLoading';

const VISIT_COUNT_KEY = 'aura-visit-count';

/**
 * Delete room docs nobody has opened in a month, and report what that cost/freed.
 *
 * The reporting is the point as much as the deletion is: `storage_usage_bytes` is how we find
 * out whether the leak is actually draining in the field, and how large it had grown before
 * anything collected it. Never throws — a bad GC pass must not be able to fail a boot.
 */
async function collectAbandonedRoomDocs(roomName: string): Promise<void> {
  const { purged, adopted, tracked } = await purgeExpiredRoomDocs(roomName);

  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  trackRoomDocsPurged({ purged, adopted, tracked, storageUsageBytes: estimate?.usage });
}

export interface GameContext {
  yDoc: Y.Doc;
  yjsNetworkProvider: YjsNetworkProvider;
  player: Player;
  roomManager: RoomManager;
  playerId: string;
  cardLookup: CardLookupService;
  tokenService: TokenService;
}

/**
 * A boot either produces a game or discovers this room is already open in
 * another tab of the same browser. The second case is not an error — it is a
 * screen (see `DuplicateTabNotice`) — so it is a result, not a thrown exception.
 */
export type BootstrapResult =
  | { status: 'ready'; context: GameContext }
  | { status: 'duplicate-tab'; roomName: string };

export interface BootstrapOptions {
  /**
   * Ask the tab that currently holds this room to stand down, and take it over,
   * rather than declining to boot. Set when the player answers the duplicate-tab
   * screen with "Play here instead".
   */
  takeOverOtherTab?: boolean;
}

export async function bootstrapGame(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  // ── 1. Core identifiers ────────────────────────────────────────────────────
  const playerId = getOrCreatePlayerId();
  console.log('Player ID:', playerId);

  const roomManager = new RoomManager();
  const roomName = roomManager.getRoomName();

  // ── 2. Claim the room for this tab ─────────────────────────────────────────
  // Before anything else: a second tab must not get as far as constructing the
  // Y.Doc, because that doc *is* the duplicate replica. Both tabs share one
  // localStorage player id, so they would both author this player's hand and
  // silently overwrite each other. See infrastructure/networking/tabLock.ts.
  const lockKey = tabLockKey(roomName, playerId);
  const tabLock = options.takeOverOtherTab
    ? await takeTabLock(lockKey)
    : await acquireTabLock(lockKey);

  if (!tabLock) return { status: 'duplicate-tab', roomName };

  // Stand down if a later tab claims the room. Releasing the lock is not enough
  // to stop being a replica — the doc and its providers are still live — so we
  // reload, which tears them down and lands this tab on the duplicate-tab screen.
  onTabTakeoverRequest(lockKey, () => {
    tabLock.release();
    window.location.reload();
  });

  const yDoc = new Y.Doc();

  // ── 3. Collect abandoned room docs ─────────────────────────────────────────
  // Every room a player opens leaves an IndexedDB database behind, so without this a
  // browser profile accumulates them forever — and since browsers evict IndexedDB
  // origin-wide under pressure, that junk is what gets the *live* room thrown away.
  //
  // Awaited, and placed before the provider is built, for two reasons: the collector
  // must not be reading the registry while the room we're about to open is writing its
  // own timestamp into it, and it must never delete a database it's about to open.
  await collectAbandonedRoomDocs(roomName);

  // ── 4. Networking ──────────────────────────────────────────────────────────
  const peerId = getOrCreatePeerId();
  const transport = await getEffectiveNetworkTransport();
  const yjsNetworkProvider = await yjsNetworkFactory.create(yDoc, {
    roomName,
    peerId,
  }, transport);

  // ── 5. Player ──────────────────────────────────────────────────────────────
  // Wait for the local IndexedDB copy to load before constructing Player, which
  // seeds default state if the doc looks empty. Seeding into a not-yet-synced
  // doc writes empty defaults (e.g. an empty hand) that win the CRDT merge
  // against the persisted state, wiping the hand on refresh.
  await yjsNetworkProvider.whenSynced();

  const restoredDeck = DeckPersistenceService.restoreDeckForRoom(roomName);
  const player = new Player(playerId, yDoc, restoredDeck, { initialHealth: 40 });

  // Populate playerStore immediately so any component reading yPlayerState gets it on mount
  usePlayerStore.getState().setYPlayerState(player.yPlayerState);

  // ── 6. Services ────────────────────────────────────────────────────────────
  const cardLookup = new CardLookupService();
  const tokenService = new TokenService(cardLookup);

  // ── 7. Populate game-instance store (before React renders) ─────────────────
  useGameInstance.getState().setYDoc(yDoc);
  useGameInstance.getState().setPlayer(player);
  useGameInstance.getState().setPlayerId(playerId);
  useGameInstance.getState().setRoomManager(roomManager);
  useGameInstance.getState().setTokenService(tokenService);
  const awareness = yjsNetworkProvider.getAwareness();
  useGameInstance.getState().setAwareness(awareness);
  // Broadcast playerId so peers can look up this player's Yjs name from the cursor overlay.
  awareness.setLocalStateField('playerId', playerId);
  watchRoomOccupancy(awareness, trackRoomOccupancyChanged);

  // ── 8. Deck seeding + auto-load ────────────────────────────────────────────
  const storage = new DeckStorageService();
  await seedDefaultDeckIfFirstLoad(storage);
  await autoLoadDeckOnStart(player, roomManager, storage);

  // ── 9. Analytics ───────────────────────────────────────────────────────────
  const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10);
  localStorage.setItem(VISIT_COUNT_KEY, (visitCount + 1).toString());

  return {
    status: 'ready',
    context: { yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService },
  };
}
