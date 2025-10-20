We have split up handling of keyboard shortcuts in GameResourcesDock.ts, KeyboardHandler, and Whiteboard.ts, we should 
probably look into consolidating using a hotkey library. Determine best course of action. 


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
