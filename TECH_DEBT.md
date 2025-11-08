# MultiPlayerBoardManager is very large

## Analysis

The `MultiPlayerBoardManager.ts` file is 816 lines and handles too many responsibilities:

1. **Player Container Management** - Creating/tracking player board containers (lines 130-237)
2. **Yjs Synchronization** - Observing changes, syncing state (lines 173-210)
3. **Opponent Visibility** - Hover/pin/opacity management (lines 239-353)
4. **Card Rendering** - Creating/updating/removing card DOM elements (lines 355-627)
5. **Drag and Drop** - Mouse event handlers for dragging (lines 629-685)
6. **Zoom Controls** - Zoom UI and state management (lines 718-798)
7. **Tooltip Management** - Hotkey tooltip positioning (lines 278-310)
8. **Layout** - Container setup and window resize handling (lines 118-124, 686-708)
9. **Keyboard Handler Setup** - Initializing keyboard callbacks (lines 79-116)

## Proposed Refactor Plan

Break into smaller, composable classes with single responsibilities:

### 1. `BoardContainerManager`
**Responsibility:** Manage player board container lifecycle and positioning
- `createContainer(playerId, isLocal): HTMLElement`
- `getContainer(playerId): HTMLElement | undefined`
- `ensureContainer(playerId): HTMLElement`
- `recenterAll(windowWidth, windowHeight): void`
- `destroy(): void`

**State:** `Map<string, HTMLElement>` of player containers

### 2. `OpponentVisibilityController`
**Responsibility:** Handle opponent board opacity based on hover/pin/count
- `handleHover(playerId, isHovered): void`
- `handlePin(playerId): void`
- `updateOpponentCount(count): void`
- `updateOpacity(): void` (internal)
- `setupEventListeners(): void`

**State:** `pinnedOpponentId`, `hoveredOpponentId`, `opponentCount`

**Dependencies:** Needs `BoardContainerManager` to access containers

### 3. `CardRenderer`
**Responsibility:** Create and update card DOM elements
- `createCardElement(card): HTMLElement`
- `updateCardElement(card): void`
- `updateCardPosition(element, card): void`
- `removeCardElement(cardId): void`
- `createCounterElement(card, index, value): HTMLElement`
- `applyZoom(cardElement, zoomLevel): void`

**State:** `Map<string, WhiteboardCard>` of cards

**Dependencies:** Needs `BoardContainerManager`, coordinate transform logic

### 4. `DragController`
**Responsibility:** Handle drag and drop interactions
- `onMouseDown(e, cardId): void`
- `onMouseMove(e): void`
- `onMouseUp(): void`
- `attachEventListeners(): void`

**State:** `DragState` object

**Dependencies:** Needs access to `yCards` and card positions

### 5. `ZoomController`
**Responsibility:** Manage zoom level and UI controls
- `setupControls(): void`
- `adjustZoom(delta): void`
- `setZoom(level): void`
- `getZoomLevel(): number`
- `destroy(): void`

**State:** `zoomLevel`, `zoomControls` element

**Events:** Emits `zoomChanged` event when zoom changes

### 6. `TooltipManager`
**Responsibility:** Show/hide/position hotkey tooltips
- `setup(): void`
- `updatePosition(x, y): void`
- `show(context): void`
- `hide(): void`
- `destroy(): void`

**State:** React root, tooltip container, current position

### 7. `YjsSyncManager`
**Responsibility:** Observe Yjs changes and coordinate updates
- `setupSync(): void`
- `observeCardChanges(onAdd, onUpdate, onDelete): void`
- `loadExistingCards(): void`
- `monitorPlayers(onNewPlayer): void`

**Dependencies:** Needs `Y.Doc`, `Y.Map<WhiteboardCard>`

### 8. `CoordinateTransformer`
**Responsibility:** Transform coordinates for opponent boards
- `transformForOpponent(card, localPlayerId, boardHeight, zoomLevel): {x, y}`

**Pure utility class** - no state

### 9. `MultiPlayerBoardManager` (Orchestrator)
**Responsibility:** Wire everything together, expose public API
- `addCard(card, ownerId): void`
- `tapCard(cardId): void`
- `setKeyboardCallbacks(callbacks): void`
- `getZoomLevel(): number`
- `destroy(): void`

**Composition:**
```typescript
class MultiPlayerBoardManager {
  private boardContainerManager: BoardContainerManager;
  private visibilityController: OpponentVisibilityController;
  private cardRenderer: CardRenderer;
  private dragController: DragController;
  private zoomController: ZoomController;
  private tooltipManager: TooltipManager;
  private yjsSyncManager: YjsSyncManager;
  private keyboardHandler: KeyboardHandler;

  constructor(...) {
    // Create all sub-managers
    this.boardContainerManager = new BoardContainerManager(mainContainer);
    this.visibilityController = new OpponentVisibilityController(this.boardContainerManager);
    this.zoomController = new ZoomController();
    this.cardRenderer = new CardRenderer(this.boardContainerManager, this.zoomController);
    this.dragController = new DragController(yCards, this.cardRenderer);
    this.tooltipManager = new TooltipManager();
    this.yjsSyncManager = new YjsSyncManager(yDoc, yCards);

    // Wire up dependencies
    this.yjsSyncManager.observeCardChanges(
      (card) => this.cardRenderer.createCardElement(card),
      (card) => this.cardRenderer.updateCardElement(card),
      (cardId) => this.cardRenderer.removeCardElement(cardId)
    );

    this.zoomController.onZoomChange((zoom) => {
      this.cardRenderer.setZoom(zoom);
    });
  }
}
```

## Migration Strategy

**Phase 1:** Extract pure utility classes (no dependencies)
1. `CoordinateTransformer` - pure functions
2. `TooltipManager` - self-contained

**Phase 2:** Extract state managers (minimal dependencies)
3. `ZoomController` - emits events
4. `BoardContainerManager` - manages containers

**Phase 3:** Extract dependent managers
5. `OpponentVisibilityController` - depends on BoardContainerManager
6. `CardRenderer` - depends on BoardContainerManager, ZoomController
7. `YjsSyncManager` - uses callbacks

**Phase 4:** Extract interaction handlers
8. `DragController` - depends on CardRenderer, YjsSyncManager

**Phase 5:** Simplify orchestrator
9. Refactor `MultiPlayerBoardManager` to compose all pieces

## Completed Phases:
**Phase 1:** Extract pure utility classes (no dependencies)
1. `CoordinateTransformer` - pure functions
2. `TooltipManager` - self-contained

**Phase 2:** Extract state managers (minimal dependencies)
3. `ZoomController` - emits events

## Benefits

- **Single Responsibility** - Each class has one clear purpose
- **Testability** - Can test zoom logic without needing Yjs
- **Reusability** - `ZoomController` could be used elsewhere
- **Maintainability** - Changes to drag logic don't affect tooltips
- **Smaller Files** - ~100-150 lines per class instead of 816
- **Type Safety** - Clear interfaces between components
- **Easier to Reason About** - Can understand one piece at a time

## Files to Create

```
src/modules/whiteboard/
├── MultiPlayerBoardManager.ts           (orchestrator, ~150 lines)
├── BoardContainerManager.ts            (~100 lines)
├── OpponentVisibilityController.ts      (~120 lines)
├── CardRenderer.ts                      (~250 lines)
├── DragController.ts                    (~80 lines)
├── ZoomController.ts                    (~100 lines)
├── TooltipManager.ts                    (~60 lines)
├── YjsSyncManager.ts                    (~100 lines)
└── CoordinateTransformer.ts            (~30 lines)
```

Total: ~990 lines (slightly more due to interfaces/imports, but much more organized)

# Keyboard shortcuts
We have split up handling of keyboard shortcuts in GameResourcesDock.ts, KeyboardHandler, and MultiPlayerBoardManager.ts, we should
probably look into consolidating using a hotkey library. Determine best course of action.

# Lack of UI component library
We should use a component library that we can customize to our style needs rather than write components from scratch.
Additionally, we shouldn't write plain HTML and JS, that makes state management hard. Use React when applicable.

# DeckPileViewer Vanilla JS in React Components

**Problem:** `OpponentHealthList.tsx` uses vanilla JS `DeckPileViewer` class via `useRef` to store instances per opponent. Each opponent gets two viewers (exile/discard) lazily instantiated in a Map. When clicked, `viewer.show(cards, pileType)` is called directly from the React component.

**To Migrate:** When rewriting `DeckPileViewer` as a React component, replace the `useRef<Map>` pattern with React state. Store `{ playerId: string, pileType: 'exile' | 'discard', cards: Card[] } | null` and conditionally render `{viewingPile && <DeckPileViewer ... />}`. Remove `getOrCreateViewer()` and `pileViewersRef` entirely—React will handle component lifecycle. Change `onViewExile/onViewDiscard` callbacks to set state instead of calling `.show()`, and pass `onClose={() => setViewingPile(null)}` to the React component.

**Files Changed:** `OpponentHealthList.tsx` (added useRef, getOrCreateViewer, viewPile functions), `HealthDisplay.tsx` (added exileCount/discardCount/onViewExile/onViewDiscard props and pile elements in JSX between health and expandedContent).

# Dragging card is handled differently 
Between Hand and Whiteboard, card dragging is handled differently. Meaning that if we want to drag a whiteboard card 
back into hand, it's difficult to code that. We need to analyze if this is the best approach.

# 🧩 Modal Behavior Refactor

Our custom `DeckSelectionModal` manually handles open/close logic (e.g., Escape key, backdrop click, focus trapping).  
This introduces unnecessary complexity and potential accessibility issues.

**Action:** Replace with a proper modal/dialog component from a UI library (e.g., `shadcn/ui`’s `Dialog` or Radix UI).

**Goals:**
- Native support for `Esc` and backdrop dismissal
- Built-in accessibility and focus management
- Simplified code (remove custom keydown/event handlers)

# issues with hide card preview for whiteboard in commit 
Issues with Current Approach

1. Unnecessary Indirection

The callback pattern adds unnecessary complexity:
KeyboardHandler → callback → Whiteboard → cardPreview.hide()

But KeyboardHandler is already tightly coupled to Whiteboard:
- Created and owned by Whiteboard
- Already calls this.keyboardHandler.setHoveredCard() directly (line 217, 225, 233)
- Not shared with other modules

2. Mixing Concerns

Your callbacks are for game logic (move card, draw card), but hiding a preview is a UI concern:
- onMoveToHand → game logic ✅ needs callback
- onDrawCard → game logic ✅ needs callback
- onHideCardPreview → UI detail ❌ should be internal

3. Empty Callback in index.ts

onHideCardPreview: () => {
// Handled by Whiteboard internally
},
This is a code smell - you're forced to provide a callback that does nothing.

Better Approach

Give KeyboardHandler direct access to CardPreview:

// KeyboardHandler.ts
export class KeyboardHandler {
private hoveredCardId: string | null = null;
private yCards: Y.Map<WhiteboardCard>;
private callbacks: KeyboardHandlerCallbacks;
private readonly localPlayerId: string;
private cardPreview: CardPreview; // ← Add this

    constructor(
      yCards: Y.Map<WhiteboardCard>,
      callbacks: KeyboardHandlerCallbacks,
      localPlayerId: string,
      cardPreview: CardPreview // ← Add parameter
    ) {
      this.yCards = yCards;
      this.callbacks = callbacks;
      this.localPlayerId = localPlayerId;
      this.cardPreview = cardPreview; // ← Store reference
      this.attachListeners();
    }

    private handleBattlefieldCardShortcuts(key: string, card: WhiteboardCard, e: KeyboardEvent): void {
      switch (key) {
        // ... other cases

        case 'h': // H - Move to hand
          e.preventDefault();
          if (card) {
            this.cardPreview.hide(); // ← Direct call, no callback
            this.callbacks.onMoveToHand(card);
            this.removeCard(card.id);
          }
          break;
      }
    }
}

Then in Whiteboard:
this.keyboardHandler = new KeyboardHandler(
this.yCards,
callbacks,
this.config.localPlayerId,
this.cardPreview // ← Pass cardPreview directly
);

And remove onHideCardPreview from the interface and all callbacks.

Why This Is Better

1. Simpler - Direct call instead of callback chain
2. Clearer separation - Game logic uses callbacks, UI details are internal
3. Fewer files to change - No need to update index.ts
4. More maintainable - CardPreview concerns stay within Whiteboard module
5. Consistent with existing patterns - KeyboardHandler already has direct access to yCards and setHoveredCard()

Should You Change It?

For this specific fix: Your current approach works fine, no critical issues.

For cleaner architecture: I'd recommend the direct reference approach, especially since you mentioned the code being "split" in your original question - this would consolidate the preview logic
better.

Want me to refactor it to use the direct reference approach?
