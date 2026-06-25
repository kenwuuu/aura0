/**
 * Deck domain logic: loading, seeding, and auto-restoring decks across sessions.
 *
 * Extracted from the `AuraApp` God Object (Phase 5).
 * Reuses `DeckStorageService`, `DeckPersistenceService`, and `DEFAULT_DECK`; depends
 * on `Player` + `RoomManager` for game-state mutations and room identity.
 */
import posthog from 'posthog-js';
import { Player } from '@/features/player';
import { RoomManager } from '@/features/room';
import { DeckStorageService } from '@/infrastructure/persistence';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import { DEFAULT_DECK } from './defaultDeck';
import { SavedDeck } from '@/features/player/types';
import { YSTATE_DECK_CARD_COUNT } from '@/constants';

const isDevEnv = import.meta.env.MODE === 'development';

const FIRST_LOAD_KEY = 'aura-first-load-completed';
const LAST_LOADED_DECK_KEY = 'aura-last-loaded-deck';

/**
 * On the very first visit (or in dev/test), seed the default deck into
 * IndexedDB so the user isn't greeted by an empty deck manager.
 */
export async function seedDefaultDeckIfFirstLoad(storage: DeckStorageService): Promise<void> {
  const hasLoadedBefore = localStorage.getItem(FIRST_LOAD_KEY);
  if (!hasLoadedBefore || isDevEnv) {
    // isDevEnv forces seeding so Playwright tests always have a deck available.
    const deckCount = await storage.getDeckCount();
    if (deckCount === 0) {
      await storage.saveDeck(DEFAULT_DECK);
      console.log('Default deck added on first load');
    }
    localStorage.setItem(FIRST_LOAD_KEY, 'true');
  }
}

/**
 * Load a saved deck into the player, persist state, and emit analytics.
 * Called both by auto-load on room entry and when the user manually picks a deck.
 */
export function loadDeck(player: Player, roomManager: RoomManager, savedDeck: SavedDeck): void {
  console.log(`Loading deck: ${savedDeck.metadata.name} (${savedDeck.cards.length} cards)`);

  // Reset player state: move all cards back to deck, clear piles, reset health
  player.reset();

  player.loadNewDeck(savedDeck).then(() => {
    // Sync the visible deck-count Yjs state
    player.yPlayerState.set(YSTATE_DECK_CARD_COUNT, player.getDeck().getCardCount());

    // Remember last-loaded deck for next session's auto-load
    localStorage.setItem(LAST_LOADED_DECK_KEY, savedDeck.metadata.id);

    // Persist deck state for this room so it survives page refresh
    DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());

    posthog.capture('deck_loaded', {
      deck_name: savedDeck.metadata.name,
      card_count: savedDeck.cards.length,
      deck_format: savedDeck.metadata.format,
      room: roomManager.getRoomName(),
    });
    console.log(`Deck "${savedDeck.metadata.name}" loaded successfully!`);
  });
}

/**
 * On entering a NEW room, auto-load whichever deck the user last used (or the
 * most recently modified one). Skips auto-load when reconnecting to a recent
 * room so in-progress game state is preserved.
 */
export async function autoLoadDeckOnStart(
  player: Player,
  roomManager: RoomManager,
  storage: DeckStorageService,
): Promise<void> {
  if (roomManager.isRecentRoom()) {
    console.log('Reconnecting to recent room - skipping auto-load to preserve game state');
    return;
  }

  roomManager.markRoomAsVisited();
  posthog.capture('game_session_started', { room: roomManager.getRoomName() });
  console.log('New room detected - will auto-load deck');

  const lastLoadedDeckId = localStorage.getItem(LAST_LOADED_DECK_KEY);

  try {
    let deckToLoad: SavedDeck | null = null;

    if (lastLoadedDeckId) {
      deckToLoad = await storage.getDeck(lastLoadedDeckId);
    }

    if (!deckToLoad) {
      const allDecks = await storage.getAllDecks();
      if (allDecks.length > 0) {
        allDecks.sort(
          (a, b) =>
            new Date(b.metadata.lastModified).getTime() -
            new Date(a.metadata.lastModified).getTime(),
        );
        deckToLoad = allDecks[0];
      }
    }

    if (deckToLoad) {
      loadDeck(player, roomManager, deckToLoad);
      console.log(`Auto-loaded deck "${deckToLoad.metadata.name}" for new room`);
    }
  } catch (error) {
    console.error('Error auto-loading deck:', error);
    // Continue without loading a deck — user can manually select one
  }
}
