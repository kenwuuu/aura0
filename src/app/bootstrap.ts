/**
 * bootstrapGame — imperative app wiring.
 *
 * Wires the game singletons (Y.Doc, networking, Player, services) in dependency
 * order, populates Zustand stores, and returns a GameContext for App.tsx.
 *
 * Deck domain logic lives in features/deck-manager/deckLoading.ts.
 */
import * as Y from 'yjs';
import * as Sentry from '@sentry/react';
import { Player } from '@/features/player';
import { RoomManager } from '@/features/room';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { yjsNetworkFactory } from '@/infrastructure/networking';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import {
  resolvePlayerIdForRoom,
  getOrCreatePeerId,
  getSeatAlias,
} from '@/infrastructure/networking';
import {
  applySessionSnapshot,
  claimSeat,
  countSnapshotCards,
  isResumeLink,
  takePendingImport,
  useSessionImportStore,
} from '@/features/session-transfer';
import {
  acquireTabLock,
  onTabTakeoverRequest,
  takeTabLock,
  tabLockKey,
} from '@/infrastructure/networking/tabLock';
import { watchRoomOccupancy } from '@/infrastructure/networking/roomOccupancy';
import { purgeExpiredRoomDocs } from '@/infrastructure/networking/roomDocStorage';
import {
  trackRoomOccupancyChanged,
  trackRoomDocsPurged,
  trackSessionImported,
} from '@/infrastructure/analytics/PosthogFunctions';
import { DeckPersistenceService, DeckStorageService } from '@/infrastructure/persistence';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import { getEffectiveNetworkTransport } from '@/app/stores/settingsStore';
import {
  autoLoadDeckOnStart,
  seedDefaultDeckIfFirstLoad,
} from '@/features/deck-manager/deckLoading';
import { recordVisit } from '@/shared/services/visitCount';
import { watchInviteConversion } from '@/features/room/inviteConversion';

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
 * A boot either produces a game or lands on a screen that has to be answered
 * first — this room is already open in another tab, or it is a restored game
 * that does not yet know which player this is. Neither is an error, so both are
 * results rather than thrown exceptions.
 *
 * `seat-selection` hands back the live doc and provider on purpose: the picker
 * has to watch for the roster arriving from peers and for seats being claimed
 * while it is open, so tearing them down first would blind it.
 */
export type BootstrapResult =
  | { status: 'ready'; context: GameContext }
  | { status: 'duplicate-tab'; roomName: string }
  | {
      status: 'seat-selection';
      roomName: string;
      yDoc: Y.Doc;
      yjsNetworkProvider: YjsNetworkProvider;
    };

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
  // Room first: which player we are can depend on which room this is. A game
  // restored from a file keeps its original seat ids, and the device that
  // claimed a seat plays as that id here — see resolvePlayerIdForRoom.
  const roomManager = new RoomManager();
  const roomName = roomManager.getRoomName();

  const playerId = resolvePlayerIdForRoom(roomName);
  console.log('Player ID:', playerId);

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

  const cardLookup = new CardLookupService();

  // ── 5a. Restore a game imported from a file ────────────────────────────────
  // Before Player, for exactly the reason above: an import that landed after
  // Player had seeded its defaults would lose the merge against them.
  const pendingImport = takePendingImport(roomName);
  if (pendingImport) {
    const store = useSessionImportStore.getState();
    store.begin();
    try {
      const { unresolved } = await applySessionSnapshot(
        yDoc,
        pendingImport,
        cardLookup,
        store.progress,
      );
      store.finish(unresolved);
      trackSessionImported({
        seatCount: pendingImport.seats.length,
        cardCount: countSnapshotCards(pendingImport),
        unresolvedCount: unresolved.length,
      });
    } catch (error) {
      // The snapshot is already consumed, so a reload lands in an ordinary (if
      // empty) room rather than replaying this failure forever.
      console.error('Failed to restore the imported game:', error);
      Sentry.captureException(error);
      store.fail('The cards in that game could not be loaded.');
      throw error;
    }
  }

  // ── 5b. Offer a seat in somebody else's restored game ──────────────────────
  // Only for a link flagged as a resume, and only until this device has picked.
  // The flag has to come from the URL: whenSynced() above resolved on IndexedDB
  // alone, so for a player opening an invite link the doc right here is still
  // empty and cannot be asked whether it is a restored game.
  else if (isResumeLink() && !getSeatAlias(roomName)) {
    return { status: 'seat-selection', roomName, yDoc, yjsNetworkProvider };
  }

  const restoredDeck = DeckPersistenceService.restoreDeckForRoom(roomName);
  const player = new Player(playerId, yDoc, restoredDeck, { initialHealth: 40 });

  // ── 5c. Record the seat claim ──────────────────────────────────────────────
  // Written here rather than on the picker screen: that screen reloads the page
  // to hand over to a normal boot, and a write issued immediately before a
  // reload may not survive the IndexedDB flush. By this point the doc is live
  // and the write is ordinary.
  if (getSeatAlias(roomName)) claimSeat(yDoc, playerId, peerId);

  // Populate playerStore immediately so any component reading yPlayerState gets it on mount
  usePlayerStore.getState().setYPlayerState(player.yPlayerState);

  // ── 6. Services ────────────────────────────────────────────────────────────
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
  watchInviteConversion(awareness, () => roomManager.getRoomName());

  // ── 8. Deck seeding + auto-load ────────────────────────────────────────────
  const storage = new DeckStorageService();
  await seedDefaultDeckIfFirstLoad(storage);
  await autoLoadDeckOnStart(player, roomManager, storage);

  // ── 9. Analytics ───────────────────────────────────────────────────────────
  // Must run before React mounts: the onboarding tour asks how many times this
  // player has been here, and the answer stops being observable once the key is
  // incremented (see shared/services/visitCount.ts).
  recordVisit();

  return {
    status: 'ready',
    context: { yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService },
  };
}
