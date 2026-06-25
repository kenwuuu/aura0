/**
 * bootstrapGame — imperative app wiring (Phase 5).
 *
 * Replaces the `AuraApp.initialize()` method from `src/index.ts`. Construction
 * order is preserved verbatim so sequencing constraints (networking before player,
 * player before dock, all instances before store population) remain visible in one
 * place. Returns a `GameContext` consumed by `App.tsx`.
 *
 * Deck domain logic lives in `features/deck-manager/deckLoading.ts`.
 * Room-link copy lives in `features/room/setupRoomLinkCopy.ts`.
 */
import * as Y from 'yjs';
import { GameResourcesDock } from '@/features/game-dock';
import { Player } from '@/features/player';
import { RoomManager } from '@/features/room';
import { setupRoomLinkCopy } from '@/features/room/setupRoomLinkCopy';
import { CardLookupService, TokenService } from '@/infrastructure/cards';
import { yjsNetworkFactory } from '@/infrastructure/networking';
import { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { getOrCreatePlayerId, getOrCreatePeerId } from '@/infrastructure/networking';
import { DeckPersistenceService, DeckStorageService } from '@/infrastructure/persistence';
import { WhiteboardEventHandlers } from '@/services/eventHandlers';
import { useGameInstance } from '@/stores/gameInstanceStore';
import { usePlayerStore } from '@/stores/playerStore';
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
  const restoredDeck = DeckPersistenceService.restoreDeckForRoom(roomManager.getRoomName());
  const player = new Player(playerId, yDoc, restoredDeck, { initialHealth: 40 });

  // Populate playerStore immediately so any component reading yPlayerState gets it on mount
  usePlayerStore.getState().setYPlayerState(player.yPlayerState);

  // ── 4. Dock (imperative class, Phase 6 target for React conversion) ────────
  const dockContainer = document.getElementById('local-dock');
  if (!dockContainer) throw new Error('Local dock container not found');

  new GameResourcesDock(dockContainer, player, {
    position: 'bottom',
    playerId,
  });

  // ── 5. Services ────────────────────────────────────────────────────────────
  const cardLookup = new CardLookupService();
  // TokenService no longer needs getZoomLevel — positioning is in flow coordinates
  const tokenService = new TokenService(() => 1, cardLookup);

  // ── 6. Populate game-instance store (before React renders) ─────────────────
  useGameInstance.getState().setYDoc(yDoc);
  useGameInstance.getState().setPlayer(player);
  useGameInstance.getState().setPlayerId(playerId);
  useGameInstance.getState().setRoomManager(roomManager);

  // ── 7. Event handlers ──────────────────────────────────────────────────────
  const eventHandlers = new WhiteboardEventHandlers(
    yDoc,
    player,
    playerId,
    () => DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck()),
  );
  eventHandlers.setupEventListeners();

  // ── 8. Room-link copy button ───────────────────────────────────────────────
  setupRoomLinkCopy(roomManager);

  // ── 9. Deck seeding + auto-load ────────────────────────────────────────────
  const storage = new DeckStorageService();
  await seedDefaultDeckIfFirstLoad(storage);
  await autoLoadDeckOnStart(player, roomManager, storage);

  // ── 10. Analytics ──────────────────────────────────────────────────────────
  const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10);
  localStorage.setItem(VISIT_COUNT_KEY, (visitCount + 1).toString());

  return { yDoc, yjsNetworkProvider, player, roomManager, playerId, cardLookup, tokenService };
}
