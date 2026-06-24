# KeyboardHandler

## Architecture

Single global `KeyboardHandler` instance that listens to `document.addEventListener('keydown')` and handles keyboard shortcuts across three priority levels:

1. **Battlefield cards** (highest) - when hovering over a card on the whiteboard
2. **Dock cards/piles** - when hovering over hand cards or piles (via `window.getGameResourcesDockHoverState`)
3. **Global shortcuts** - no hover required (Draw, Untap All, Shuffle)

### Duplicate KeyboardHandler

Root Cause

The issue is in Whiteboard.ts lines 56-66: A new KeyboardHandler instance is created when setKeyboardCallbacks() is called, but the old one is never destroyed!

public setKeyboardCallbacks(callbacks: KeyboardHandlerCallbacks): void {
this.keyboardCallbacks = callbacks;
this.keyboardHandler = new KeyboardHandler(  // ❌ Creates NEW instance
this.yCards,
{
...callbacks,
onHideCardPreview: () => this.cardPreview.hide(),
},
this.config.localPlayerId
);
// ❌ Old keyboardHandler is never cleaned up!
}

What happens:
1. Constructor (line 42-53): Creates KeyboardHandler #1 with empty callbacks
   - Attaches document.addEventListener('keydown', ...)
2. index.ts calls whiteboard.setKeyboardCallbacks() (line 168)
3. setKeyboardCallbacks (line 58): Creates KeyboardHandler #2 with real callbacks
   - Attaches another document.addEventListener('keydown', ...)
4. KeyboardHandler #1 is still alive with its event listener still attached!
5. When you press 'h', both event listeners fire

Evidence

In KeyboardHandler.ts line 38, the attachListeners method adds the event listener:
private attachListeners(): void {
document.addEventListener('keydown', (e) => this.handleKeyDown(e));
// ❌ No cleanup mechanism! No removeEventListener!
}

There's also a destroy() method (line 354-356) but it does nothing:
public destroy(): void {
// Event listener cleanup if needed  ❌ NOT IMPLEMENTED
}

#### solution
Pass the callbacks in the constructor instead of using empty callbacks initially.

Changes needed:
1. Refactor Whiteboard constructor to accept callbacks
2. Update index.ts to pass callbacks during construction
3. Remove setKeyboardCallbacks() entirely

Pros: Cleanest architecture, no recreation needed
Cons: More refactoring, changes initialization order


## Critical Bug Fixed (2025-10-20)

**Problem:** Pressing 'h' fired twice - moved card to hand AND triggered pile handler.

**Root Cause:** Multiple `KeyboardHandler` instances existed simultaneously:
- Instance #1 created in `Whiteboard` constructor with empty callbacks
- Instance #2 created in `setKeyboardCallbacks()` with real callbacks
- **Old instance #1 was never destroyed** - its event listener remained active

**Solution:** Proper cleanup pattern implemented:
```typescript
// Store bound reference to enable removal
private handleKeyDownBound: (e: KeyboardEvent) => void;

constructor(...) {
  this.handleKeyDownBound = (e) => this.handleKeyDown(e);
  document.addEventListener('keydown', this.handleKeyDownBound);
}

public destroy(): void {
  document.removeEventListener('keydown', this.handleKeyDownBound);
}
```

And call cleanup before recreating:
```typescript
// Whiteboard.ts
public setKeyboardCallbacks(callbacks: KeyboardHandlerCallbacks): void {
  this.keyboardHandler.destroy(); // ✅ Clean up old instance first
  this.keyboardHandler = new KeyboardHandler(...);
}
```

## Watch Out For

⚠️ **Never create multiple KeyboardHandler instances** - Only one should exist per app lifecycle

⚠️ **Always call `destroy()` before creating a new instance** - Prevents event listener accumulation

⚠️ **Store bound event handler references** - Required to remove them later (`removeEventListener` needs the exact same function reference)

⚠️ **Avoid arrow functions directly in addEventListener** - Use stored references instead:
```typescript
// ❌ BAD - Can't remove later
document.addEventListener('keydown', (e) => this.handleKeyDown(e));

// ✅ GOOD - Can remove using stored reference
this.handleKeyDownBound = (e) => this.handleKeyDown(e);
document.addEventListener('keydown', this.handleKeyDownBound);
```

## Related Files

- `Whiteboard.ts` - Creates and manages KeyboardHandler lifecycle
- `GameResourcesDock.ts` - Exposes `window.getGameResourcesDockHoverState()` for dock shortcuts
- `PileViewer.ts` - Has its own separate keyboard handler for modal interactions