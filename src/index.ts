import * as Y from 'yjs';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Deck } from './modules/deck';
import { MultiPlayerBoardManager, KeyboardHandlerCallbacks } from './modules/whiteboard';
import { WebRTCProvider } from './modules/webrtc';
import { getOrCreatePlayerId, getOrCreatePeerId } from './modules/webrtc/persistence';
import { Player } from './modules/player';
import { GameResourcesDock } from './modules/gameResourcesDock';
import { DeckManager, WelcomeModal, HotkeysModal, HelpModal, AddCardManager } from './components';
import { OpponentHealthList } from './components/OpponentHealthList';
import { SavedDeck } from './modules/deck/types';
import { TokenService } from './services/scryfall';
import { ScryfallApiService } from './services/scryfall/ScryfallApiService';
import { CardPreview } from './modules/cardPreview';
import { DeckStorageService } from './services/deckStorage';
import { DEFAULT_DECK } from './data/defaultDeck';
import './style.css';
import {CARD_HEIGHT, CARD_WIDTH} from "./constants";

class AuraApp {
  private yDoc: Y.Doc;
  private webrtcProvider: WebRTCProvider;
  private whiteboard: MultiPlayerBoardManager;
  private localPlayer: Player;
  private localDock: GameResourcesDock;
  private opponentHealthRoot: Root | null = null;
  private tokenService: TokenService;
  private cardPreview: CardPreview;
  private playerId: string;
  private scryfallApiService: ScryfallApiService;
  private roomName: string;

  constructor() {
    this.yDoc = new Y.Doc();

    // Get or create persistent player ID (survives page reloads)
    this.playerId = getOrCreatePlayerId();
    console.log('Player ID:', this.playerId);

    // Get room name from URL or generate a random one
    const urlParams = new URLSearchParams(window.location.search);
    this.roomName = urlParams.get('room') ?? this.generateRoomId();

    // Update URL with room name if not present
    if (!urlParams.get('room')) {
      window.history.replaceState({}, '', `?room=${this.roomName}`);
    }

    // Get or create persistent peer ID for WebRTC
    const peerId = getOrCreatePeerId();

    // Initialize WebRTC provider with persistence
    this.webrtcProvider = new WebRTCProvider(this.yDoc, {
      roomName: this.roomName,
      peerId, // Pass persistent peer ID
    });

    // Initialize local player deck
    const localDeck = new Deck({
      initialCardCount: 60,
    });

    // Initialize local player
    this.localPlayer = new Player(this.playerId, this.yDoc, localDeck, {
      initialHealth: 40,
    });

    // Create shared card preview instance (used by both Whiteboard and GameResourcesDock)
    this.cardPreview = new CardPreview();

    // Initialize multi-player board manager
    const whiteboardContainer = document.getElementById('whiteboard');
    if (!whiteboardContainer) {
      throw new Error('Whiteboard container not found');
    }

    this.whiteboard = new MultiPlayerBoardManager(
      whiteboardContainer,
      this.yDoc,
      this.playerId,
      '#1a1a1a', // backgroundColor
      this.cardPreview
    );

    // Initialize local player's resource dock
    const dockContainer = document.getElementById('local-dock');
    if (!dockContainer) {
      throw new Error('Local dock container not found');
    }

    this.localDock = new GameResourcesDock(dockContainer, this.localPlayer, {
      position: 'bottom',
      playerId: this.playerId,
    }, this.cardPreview);

    // Initialize opponent health display with React
    const opponentHealthContainer = document.getElementById('opponent-health-container');
    if (!opponentHealthContainer) {
      throw new Error('Opponent health container not found');
    }

    this.opponentHealthRoot = createRoot(opponentHealthContainer);
    this.opponentHealthRoot.render(
      React.createElement(OpponentHealthList, {
        yDoc: this.yDoc,
        localPlayerId: this.playerId,
      })
    );

    // Initialize Scryfall API service
    this.scryfallApiService = new ScryfallApiService();

    // Initialize token service with zoom level provider
    this.tokenService = new TokenService(
      () => this.whiteboard.getZoomLevel(), // Inject zoom level getter
      this.scryfallApiService,
    );

    this.setupEventListeners();
    this.setupConnectionStatus();
    this.setupKeyboardCallbacks();
    this.setupDeckManager();
    this.setupHelpModal();
    this.setupHotkeyHintsModal();
    this.setupAddCardModal();
  }

  private setupKeyboardCallbacks(): void {
    const callbacks: KeyboardHandlerCallbacks = {
      onMoveToHand: (card) => {
        // Remove from battlefield and add to hand
        const hand = this.localPlayer.getState().hand;
        this.localPlayer['yPlayerState'].set('hand', [...hand, card]);
      },
      onMoveToDeckTop: (card) => {
        this.localPlayer.moveCardToDeckTop(card);
      },
      onMoveToDeckBottom: (card) => {
        this.localPlayer.moveCardToDeckBottom(card);
      },
      onMoveToGraveyard: (card) => {
        this.localPlayer.moveCardToDiscard(card);
      },
      onMoveToExile: (card) => {
        this.localPlayer.moveCardToExile(card);
      },
      onDrawCard: () => {
        this.localPlayer.drawCard();
      },
      onShuffleDeck: () => {
        this.localPlayer.shuffleDeck();
      },
      onUntapAll: () => {
        console.log('Untapping all cards');
      },
      onEndTurn: () => {
        console.log('End turn - not yet implemented');
      },
      onHideCardPreview: () => {
        // Handled by Whiteboard internally
      },
      onMulligan: () => {
        const confirmed = window.confirm(
          "Mulligan? Draws 7 new cards."
        );
        if (confirmed) {
          this.localPlayer.mulligan(7);
        }
      },
      loseHealth: () => {
        this.localPlayer.modifyHealth(-1);
      },
      gainHealth: () => {
        this.localPlayer.modifyHealth(1);
      },
    };

    this.whiteboard.setKeyboardCallbacks(callbacks);
  }

  private generateRoomId(): string {
    return `mtg-${Math.random().toString(36).substring(2, 9)}`;
  }

  private setupEventListeners(): void {
    const whiteboardContainer = document.getElementById('whiteboard');

    // Setup whiteboard as a drop zone
    if (whiteboardContainer) {
      whiteboardContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
      });

      whiteboardContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        const cardId = e.dataTransfer?.getData('text/plain');
        if (!cardId) return;

        // Try to play the card from hand
        const card = this.localPlayer.removeCardFromHand(cardId);
        if (card) {
          // Calculate board offset (board is centered on screen)
          const BOARD_WIDTH = 16 * CARD_WIDTH;
          const BOARD_HEIGHT = 6.5 * CARD_HEIGHT;
          const DOCK_HEIGHT = 160;
          const boardLeft = (window.innerWidth - BOARD_WIDTH) / 2;
          const boardTop = window.innerHeight - BOARD_HEIGHT - DOCK_HEIGHT;

          // Convert screen coordinates to board-relative coordinates
          // Then subtract card center offset for proper placement under cursor
          card.x = e.clientX - boardLeft - ((CARD_WIDTH / 2) * this.whiteboard.getZoomLevel());
          card.y = e.clientY - boardTop - ((CARD_HEIGHT / 2) * this.whiteboard.getZoomLevel()) - 60;
          this.whiteboard.addCard(card, this.playerId);

          // Search for and create any tokens related to card
          if (card.scryfallId) {
            const result = await this.tokenService.createTokensForCard(
              card.scryfallId,
              { x: card.x, y: card.y } // Place tokens to the right of the card
            );

            // Add tokens to battlefield
            result.tokens.forEach(token => {
              this.whiteboard.addCard(token, this.playerId);
            });

            // Log any errors
            if (result.errors.length > 0) {
              console.warn(`Token creation errors for ${card.name}:`, result.errors);
            }
          }
        }
      });
    }

    // Listen for cards being dragged from battlefield to dock
    window.addEventListener('moveCardFromBattlefield', ((event: CustomEvent) => {
      const { cardId, destination } = event.detail;

      // Get the card from battlefield (yCards)
      const yCards = this.yDoc.getMap('cards');
      const card = yCards.get(cardId);

      if (!card || card.ownerId !== this.playerId) return;

      // Remove WhiteboardCard-specific properties (zIndex, ownerId) to get base Card
      const { zIndex, ownerId, ...baseCard } = card;

      // Add card to the appropriate pile
      if (destination === 'hand') {
        this.localPlayer.putCardInHand(baseCard);
      } else if (destination === 'exile') {
        this.localPlayer.moveCardToExile(baseCard);
      } else if (destination === 'discard') {
        this.localPlayer.moveCardToDiscard(baseCard);
      } else if (destination === 'deck') {
        this.localPlayer.moveCardToDeckTop(baseCard);
      }

      // Remove card from battlefield
      yCards.delete(cardId);
    }) as EventListener);
  }

  private setupConnectionStatus(): void {
    const statusElement = document.getElementById('connection-status');
    const roomElement = document.getElementById('room-name');

    if (roomElement) {
      roomElement.textContent = `Room: ${this.webrtcProvider.getRoomName()}`;
    }

    this.webrtcProvider.onStatusChange((status) => {
      if (statusElement) {
        if (status.isConnected) {
          statusElement.textContent = `Connected (${status.peersCount} peer${status.peersCount !== 1 ? 's' : ''})`;
          statusElement.style.color = '#4ade80';
        } else {
          statusElement.textContent = 'Waiting for peers...';
          statusElement.style.color = '#facc15';
        }
      }
    });
  }

  private async setupDeckManager(): Promise<void> {
    const deckManagerRoot = document.getElementById('deck-manager-root');
    if (!deckManagerRoot) {
      throw new Error('Deck manager root not found');
    }

    const storage = new DeckStorageService();

    // Check if this is the user's first-ever load
    const FIRST_LOAD_KEY = 'aura-first-load-completed';
    const hasLoadedBefore = localStorage.getItem(FIRST_LOAD_KEY);

    if (!hasLoadedBefore) {
      // First load ever - add default deck if no decks exist
      const deckCount = await storage.getDeckCount();

      if (deckCount === 0) {
        await storage.saveDeck(DEFAULT_DECK);
        console.log('Default deck added on first load');
      }

      // Mark that first load is complete
      localStorage.setItem(FIRST_LOAD_KEY, 'true');
    }

    await this.loadDeckOnStart(storage);

    const root = createRoot(deckManagerRoot);
    root.render(
      React.createElement(DeckManager, {
        onDeckSelected: (deck: SavedDeck) => this.loadDeck(deck),
      })
    );

    // Setup welcome modal
    const welcomeModalRoot = document.createElement('div');
    welcomeModalRoot.id = 'welcome-modal-root';
    document.body.appendChild(welcomeModalRoot);
    const welcomeRoot = createRoot(welcomeModalRoot);
    welcomeRoot.render(React.createElement(WelcomeModal));
  }

  private async loadDeckOnStart(storage: DeckStorageService) {
    // Only auto-load deck when entering a NEW room, not when reconnecting
    // Track up to 3 recent rooms to allow switching between them without auto-load
    const VISITED_ROOMS_KEY = 'aura-visited-rooms';
    const visitedRoomsJson = localStorage.getItem(VISITED_ROOMS_KEY);
    const visitedRooms: string[] = visitedRoomsJson ? JSON.parse(visitedRoomsJson) : [];

    // Check if this room was recently visited (in the last 3 rooms)
    const isRecentRoom = visitedRooms.includes(this.roomName);

    if (isRecentRoom) {
      console.log('Reconnecting to recent room - skipping auto-load to preserve game state');
      return;
    }

    // Add this room to visited list (keep only last 3)
    const updatedRooms = [this.roomName, ...visitedRooms.filter(r => r !== this.roomName)].slice(0, 3);
    localStorage.setItem(VISITED_ROOMS_KEY, JSON.stringify(updatedRooms));
    console.log('New room detected - will auto-load deck');

    // Auto-load the first available deck on entering a new room
    const LAST_LOADED_DECK_KEY = 'aura-last-loaded-deck';
    const lastLoadedDeckId = localStorage.getItem(LAST_LOADED_DECK_KEY);

    try {
      let deckToLoad: SavedDeck | null = null;

      // Try to load the last loaded deck
      if (lastLoadedDeckId) {
        deckToLoad = await storage.getDeck(lastLoadedDeckId);
      }

      // If no last loaded deck or it doesn't exist anymore, get the first available deck
      if (!deckToLoad) {
        const allDecks = await storage.getAllDecks();
        if (allDecks.length > 0) {
          // Sort by last modified (most recent first) and take the first one
          allDecks.sort((a, b) =>
            new Date(b.metadata.lastModified).getTime() - new Date(a.metadata.lastModified).getTime()
          );
          deckToLoad = allDecks[0];
        }
      }

      // Load the deck if found
      if (deckToLoad) {
        this.loadDeck(deckToLoad);
        localStorage.setItem(LAST_LOADED_DECK_KEY, deckToLoad.metadata.id);
        console.log(`Auto-loaded deck "${deckToLoad.metadata.name}" for new room`);
      }
    } catch (error) {
      console.error('Error auto-loading deck:', error);
      // Continue without loading a deck - user can manually select one
    }
  }

  private loadDeck(savedDeck: SavedDeck): void {
    console.log(`Loading deck: ${savedDeck.metadata.name} (${savedDeck.cards.length} cards)`);

    // Reset player state: move all cards back to deck, clear piles, reset health
    this.localPlayer.reset();

    // Create a new deck with the imported cards
    const newDeck = new Deck({
      initialCardCount: savedDeck.cards.length,
    }, savedDeck.cards);

    // Update the player's deck
    this.localPlayer.loadNewDeck(newDeck);

    // Update deck count in Yjs state
    this.localPlayer['yPlayerState'].set('deckCardCount', newDeck.getCardCount());

    // Save this as the last loaded deck for auto-loading on next visit
    localStorage.setItem('aura-last-loaded-deck', savedDeck.metadata.id);

    console.log(`Deck "${savedDeck.metadata.name}" loaded successfully!`);
  }

  private setupHelpModal(): void {
    const helpRoot = document.getElementById('help-root');
    if (!helpRoot) {
      throw new Error('Help root not found');
    }

    // Create a simple component that manages the button and modal state
    const HelpButton: React.FC = () => {
      const [isOpen, setIsOpen] = React.useState(false);

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          {
            className: 'toolbar-button',
            onClick: () => setIsOpen(true),
          },
          'Help'
        ),
        React.createElement(HelpModal, {
          isOpen,
          onClose: () => setIsOpen(false),
        })
      );
    };

    const root = createRoot(helpRoot);
    root.render(React.createElement(HelpButton));
  }

  private setupHotkeyHintsModal(): void {
    const hotkeysRoot = document.getElementById('hotkeys-root');
    if (!hotkeysRoot) {
      throw new Error('Hotkeys root not found');
    }

    // Create a simple component that manages the button and modal state
    const HotkeysButton: React.FC = () => {
      const [isOpen, setIsOpen] = React.useState(false);

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          {
            className: 'toolbar-button',
            onClick: () => setIsOpen(true),
          },
          'Hotkeys'
        ),
        React.createElement(HotkeysModal, {
          isOpen,
          onClose: () => setIsOpen(false),
        })
      );
    };

    const root = createRoot(hotkeysRoot);
    root.render(React.createElement(HotkeysButton));
  }

  private setupAddCardModal(): void {
    const addCardModalRoot = document.createElement('div');
    addCardModalRoot.id = 'add-card-modal-root';
    document.body.appendChild(addCardModalRoot);

    const root = createRoot(addCardModalRoot);
    root.render(
      React.createElement(AddCardManager, {
        scryfallApiService: this.scryfallApiService,
        onAddCard: (card) => this.localPlayer.putCardInHand(card),
      })
    );
  }

  public destroy(): void {
    this.whiteboard.destroy();
    this.localDock.destroy();
    if (this.opponentHealthRoot) {
      this.opponentHealthRoot.unmount();
    }
    this.webrtcProvider.destroy();
    this.cardPreview.destroy();
  }
}

// Initialize the app
const app = new AuraApp();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app.destroy();
});