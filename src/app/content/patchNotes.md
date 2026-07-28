## 2026 July 15–16

### Features
- Redesigned every pile viewer (deck, hand, discard, exile, scry) for desktop and mobile: tap to select multiple cards, then move them all at once with a new destination bar (Hand / Grave / Exile / Deck top / Deck bottom).
- Added a "Create token" grid to the board menu for quickly making common tokens and counters, including a tap-to-add sheet on mobile.
- Context menus now follow your cursor — right-click a second time and the menu re-opens at the new position instead of staying pinned where you first opened it.

### Changes
- "View" moved to the top of the deck/pile context menu, since it's the action you use most.
- Renamed "Token" to "Counter" in the token grid, and decrementing a counter to 0 no longer deletes it.
- Sideboard cards now import alongside your main deck and get their own pile on the board — the pile stays hidden if you didn't import a sideboard.
- Onboarding now teaches by walking new players through real actions instead of just describing them.

### Bug Fixes
- Fixed the pile viewer rendering off-screen on mobile in the production build.
- Fixed dragging a token out of the board's context-menu token grid.
- Fixed players behind an ad blocker getting stranded alone on a different connection type than the rest of the table.

---

## 2026 July 11–14

### Features
- Deck import now accepts quantity-less lists and `//` / `#` section markers, and tolerates section headers like "Sideboard:" without breaking.
- Only a legendary card can be set as your commander, and fixed a bug where your whole deck could end up in the command zone instead of your library.

### Changes
- Live cursor movement and dragging cards feel noticeably smoother.
- The action log now announces when a player joins the room.
- Removed the repeat-usage nag modal.

### Bug Fixes
- Fixed a duplicate-tab bug that could clobber your hand.
- Fixed the action log dragging with noticeable lag.

---

## 2026 July 9–10

### Features
- New mobile-responsive shell: safe-area aware layout, a phone-sized HUD, and a dedicated mobile hand view.
- Right-click (or tap, on touch devices) context menus on every game item — cards, tokens, piles, and the empty board.

### Bug Fixes
- Fixed a dropdown that wouldn't reopen after selecting an item.
- Fixed the mobile board-card context menu so it opens on the first tap.
