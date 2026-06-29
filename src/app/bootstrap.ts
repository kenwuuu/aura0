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
import { DeckPersistenceService, DeckStorageService } from '@/infrastructure/persistence';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { usePlayerStore } from '@/app/stores/playerStore';
import {
  autoLoadDeckOnStart,
  seedDefaultDeckIfFirstLoad,
} from '@/features/deck-manager/deckLoading';

const VISIT_COUNT_KEY = 'aura-visit-count';

export interface GameContext {
  yDoc: Y.Doc;
  yjsNetworkProvider: YjsNetworkProvider;
  player: Player;
  roomManager: RoomManager;
  playerId: string;
  cardLookup: CardLookupService;
  tokenService: TokenService;
}

export async function bootstrapGame(): Promise<GameContext> {
  // ── 1. Core identifiers ────────────────────────────────────────────────────
  const yDoc = new Y.Doc();

  // Log size of Yjs incremental update. We want to eventually reduce the size and volume of updates
  // from drawing a card (70KB) and moving a card on board (hundreds of updates for a single drag).
  yDoc.on('update', (update: Uint8Array) => {
    console.debug(`Yjs incremental update of size: ${update.byteLength} bytes`);
  });

  const playerId = getOrCreatePlayerId();
  console.log('Player ID:', playerId);

  const roomManager = new RoomManager();

  // ── 2. Networking ──────────────────────────────────────────────────────────
  const peerId = getOrCreatePeerId();
  const yjsNetworkProvider = await yjsNetworkFactory.create(yDoc, {
    roomName: roomManager.getRoomName(),
    peerId,
  });

  // ── 3. Player ──────────────────────────────────────────────────────────────
  // Wait for the local IndexedDB copy to load before constructing Player, which
  // seeds default state if the doc looks empty. Seeding into a not-yet-synced
  // doc writes empty defaults (e.g. an empty hand) that win the CRDT merge
  // against the persisted state, wiping the hand on refresh.
  await yjsNetworkProvider.whenSynced();

  const restoredDeck = DeckPersistenceService.restoreDeckForRoom(roomManager.getRoomName());
  const player = new Player(playerId, yDoc, restoredDeck, { initialHealth: 40 });

  // Populate playerStore immediately so any component reading yPlayerState gets it on mount
  usePlayerStore.getState().setYPlayerState(player.yPlayerState);

  // ── 4. Services ────────────────────────────────────────────────────────────
  const cardLookup = new CardLookupService();
  // TokenService no longer needs getZoomLevel — positioning is in flow coordinates
  const tokenService = new TokenService(() => 1, cardLookup);

  // ── 5. Populate game-instance store (before React renders) ─────────────────
  useGameInstance.getState().setYDoc(yDoc);
  useGameInstance.getState().setPlayer(player);
  useGameInstance.getState().setPlayerId(playerId);
  useGameInstance.getState().setRoomManager(roomManager);
  useGameInstance.getState().setTokenService(tokenService);

  // ── 6. Deck seeding + auto-load ────────────────────────────────────────────
  const storage = new DeckStorageService();
  await seedDefaultDeckIfFirstLoad(storage);
  await autoLoadDeckOnStart(player, roomManager, storage);

  // ── 7. Analytics ───────────────────────────────────────────────────────────
  const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10);
  localStorage.setItem(VISIT_COUNT_KEY, (visitCount + 1).toString());

  return { yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService };
}
