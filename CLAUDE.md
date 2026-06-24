# CLAUDE.md

This codebase (Aura) is a **peer-to-peer app for playing Magic: The Gathering on a collaborative whiteboard** using WebRTC (via Yjs and y-webrtc) for real-time state synchronization. The app has no backend server for game state - all synchronization happens peer-to-peer through CRDTs.

**Key Technologies:**
- **Vite**
- **TypeScript**
- **Yjs** - CRDT-based state synchronization library
- **y-webrtc** - WebRTC provider for Yjs (peer-to-peer networking)
- **React**
- **Tailwind**
- **Sentry**
- **Posthog**
- **shadcn**

Use React with Yjs via `y-react` bindings

## Essential Commands

```bash
# Development
npm run dev          # Start dev server at http://localhost:5173 (auto-opens browser)
npm run build        # Type-check with tsc, then build with Vite
npm run preview      # Preview production build locally

# Type checking only
npx tsc --noEmit     # Check for TypeScript errors without building
```


## Architecture: Modular Design

The codebase is organized into **independently replaceable modules** with clear interfaces:

```
src/
├── index.ts                    # Entry point - wires everything together
├── style.css                   # Global styles (580 lines)
└── modules/
    ├── deck/                   # Local deck management (not synced)
    ├── player/                 # Per-player state (synced via Yjs)
    ├── whiteboard/             # Battlefield canvas (synced via Yjs)
    ├── gameResourcesDock/      # Bottom UI (hand, piles, life)
    └── webrtc/                 # WebRTC networking wrapper
```

### Module Communication Patterns

**1. Yjs for State Synchronization**
- Battlefield cards: `yDoc.getMap(YDOC_CARDS_ON_BOARD)` - shared across all players
- Player state: `yDoc.getMap(YDOC_PLAYER(id))` - one per player
- Changes to any Yjs map automatically sync to all connected peers

**2. CustomEvents for Cross-Module Actions**
```typescript
// Player plays card from hand → Whiteboard needs to render it
window.dispatchEvent(new CustomEvent('playCard', {
  detail: { card, playerId }
}));
```

**3. Global Functions for Keyboard Integration**
```typescript
// GameResourcesDock exposes hover state for KeyboardHandler
(window as any).getGameResourcesDockHoverState = () => {
  return { hoveredHandCardId, hoveredPileType, /* methods */ };
};
```

**4. Callbacks for Reactive Updates**
```typescript
// Player state changes trigger UI updates
player.onStateChange((newState) => {
  // Update dock UI
});
```

## Critical Architectural Concepts

Everything in Yjs is visible to all peers. Privacy (like hands) is **enforced by UI convention only** - the data is technically accessible to any peer.

### 2. Local vs Synced State

| Data | Storage | Synced? | Reason |
|------|---------|---------|--------|
| Deck contents | `Deck` class (local) | ❌ No | Private to player |
| Deck count | Yjs `player-{id}.deckCardCount` | ✅ Yes | Opponents see your deck size |
| Hand | Yjs `player-{id}.hand` | ✅ Yes | *Trust-based privacy* |
| Battlefield cards | Yjs `cards` map | ✅ Yes | All players see all cards |
| Life total | Yjs `player-{id}.health` | ✅ Yes | Public information |
| Exile/Graveyard | Yjs `player-{id}.exilePile/discardPile` | ✅ Yes | Public zones |

### 4. Z-Index Management

**Critical Bug Context:** There was a bug where `maxZIndex` wasn't syncing properly across peers, causing cards to disappear. The fix:

```typescript
// In Whiteboard.ts setupYjsSync()
yCards.observe((event) => {
  event.changes.keys.forEach((change, key) => {
    const card = yCards.get(key);
    if (card && card.zIndex > this.maxZIndex) {
      this.maxZIndex = card.zIndex;  // MUST sync maxZIndex from observations
    }
  });
});
```

### 5. Keyboard Shortcuts Architecture

**Three-Level Priority System:**

1. **Battlefield cards** (highest priority) - when hovering a card on the battlefield
2. **Dock cards/piles** - when hovering hand cards or piles (deck, exile, discard)
3. **Global shortcuts** - no hover required (Draw, Untap All, Shuffle)

**Implementation Split:**
- `KeyboardHandler.ts` - Handles all keyboard events, checks all three levels
- `GameResourcesDock.ts` - Exposes hover state via `window.getGameResourcesDockHoverState()`
- `PileViewer.ts` - Separate keyboard handler for modal dialogs

## Key Files to Understand

### `src/index.ts` (Application Entry Point)
- Creates `Y.Doc` (shared state container)
- Initializes `WebRTCProvider` (networking)
- Creates `Player` instance with local `Deck`
- Wires up `Whiteboard`, `GameResourcesDock`, and `OpponentHealthDisplay`
- Sets up keyboard callbacks connecting Player actions to KeyboardHandler

### `src/modules/whiteboard/Whiteboard.ts` (Battlefield)
- Manages `yCards` Yjs map (shared battlefield state)
- Renders cards as absolutely-positioned DOM elements
- Handles drag-and-drop with manual coordinate tracking
- Manages z-index for card layering
- Creates and destroys card DOM elements based on Yjs observations

### `src/modules/whiteboard/KeyboardHandler.ts` (Shortcuts)
- Three-level priority system (battlefield → dock → global)
- Tracks `hoveredCardId` for battlefield cards
- Queries `window.getGameResourcesDockHoverState()` for dock interactions
- Implements all keyboard shortcuts (Space, D, S, T, Y, H, U, K, F, etc.)

### `src/modules/player/Player.ts` (Player State)
- Owns local `Deck` instance (not synced)
- Manages `yPlayerState` Yjs map (synced to all peers)
- `drawCard()` - moves card from local deck to synced hand
- `playCardFromHand()` - removes from hand, dispatches `playCard` event
- Methods for moving cards to exile/discard/deck

### `src/modules/gameResourcesDock/GameResourcesDock.ts` (Bottom UI)
- Renders hand cards, piles (exile/discard/deck), and life total
- Tracks `hoveredHandCardId` and `hoveredPileType` for keyboard shortcuts
- Exposes `getGameResourcesDockHoverState()` globally
- Opens `PileViewer` modal when clicking piles
- Handles drag-and-drop from hand to battlefield or piles

### `src/modules/deck/Deck.ts` (Local Deck)
- **Not synced** - purely local state
- Initializes 60 blank cards with unique IDs and card numbers 1-60
- `drawCard()` - LIFO (pops from end of array)
- `shuffleDeck()` - Fisher-Yates shuffle
- `addCardToTop()` / `addCardToBottom()` - for returning cards to deck

## Custom span instrumentation in API calls

```javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `GET /api/users/${userId}`,
    },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      return data;
    },
  );
}
```

## Deployment Notes

```bash
npm run build
# Outputs to dist/ folder
# Deploy dist/ to any static host (Netlify, Vercel, GitHub Pages, etc.)
# Ensure signaling server is accessible (default uses Railway.app deployment)
```

# Testing
Writing tests, see @tests/testing.md