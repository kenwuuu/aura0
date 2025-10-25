# Keyboard shortcuts
We have split up handling of keyboard shortcuts in GameResourcesDock.ts, KeyboardHandler, and Whiteboard.ts, we should
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
