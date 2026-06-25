# Aura Architecture Refactor Plan

Goal: screaming (feature-based) architecture + eliminate imperative class patterns.
Motivating goal: replace the whiteboard, which requires `features/battlefield/` to be cleanly isolated.

---

## Current Problems

1. **`src/index.ts` is a God Object (583 lines)** — `AuraApp` class initializes Sentry, Posthog, WebRTC, Player, whiteboard, dock, 7+ modals, hotkeys, deck manager all in one place.
2. **Two parallel keyboard systems** — `KeyboardHandler.ts` (old, imperative) was replaced by `useAllGameHotkeys` + `react-hotkeys-hook` but the class was never deleted (~450 dead lines).
3. **React trees scattered** — `GameResourcesDock`, `TooltipManager`, `CardPreview`, and `AuraApp` each call `createRoot()` internally, creating ~10 separate React roots with no shared context.
4. **`window` as a message bus** — `window.dispatchEvent(CustomEvent(...))` is used for 8+ cross-module events (moveCardToHand, moveCardToDiscard, etc.), `window.getGameResourcesDockHoverState()` exposes dock state globally.
5. **Directories don't reflect domain** — `modules/`, `services/`, `components/`, `actions/`, `hooks/` all mixed at the same level with inconsistent casing (`deck_manager` vs camelCase).
6. **`battlefieldCardActions.ts` breaks encapsulation** — uses `whiteboard['yCards']` and `whiteboard['maxZIndex']` (bracket notation to access private fields).

---

## Dead Code to Delete

| File | Lines | Reason |
|---|---|---|
| `src/modules/whiteboard/KeyboardHandler.ts` | ~450 | Not imported by MultiPlayerBoardManager; fully replaced by `useAllGameHotkeys` |
| `src/modules/cardPreview/CardPreview.ts` | ~208 | Imperative version; `CardPreview.tsx` already exists as React replacement (incomplete) |
| `src/modules/cardPreview/CardPreviewWrapper.ts` | ~? | Wrapper for the dead imperative version |
| `src/App.tsx` | 37 | Placeholder ("React root mounted successfully!"), not used |

---

## Library Simplifications (No New Installs)

| Current | Replacement | Savings |
|---|---|---|
| `ZoomController.ts` (132 lines DOM buttons) | 20-line React component with `useState` + Tailwind | ~110 lines |
| `CardPreview.ts` (208 lines imperative) | Finish `CardPreview.tsx` (44 lines, already started — add zoom + position + flip) | ~170 lines |
| `window.confirm()` for mulligan in `useAllGameHotkeys.ts:69` | `triggerConfirmation()` — already in `src/utils/confirmation.tsx` | 1-line fix |
| Manual `localStorage` in ZoomController + CardPreview | Zustand `persist` middleware (already using Zustand) | ~10 lines |

**One new library to add:**
- `@radix-ui/react-popover` (via `npx shadcn add popover`) — replaces `TooltipManager.ts` (~197 lines of manual createRoot + timers + click-outside). Already using 5 other Radix primitives.

---

## Target Structure

```
src/
├── features/
│   ├── battlefield/          ← was modules/whiteboard/  [WHITEBOARD REPLACEMENT TARGET]
│   │   ├── BattlefieldCanvas.ts   (was MultiPlayerBoardManager)
│   │   ├── ZoomControls.tsx       (was ZoomController.ts → React component)
│   │   ├── BoardContainerManager.ts
│   │   ├── BoardCanvasRenderer.ts
│   │   ├── OpponentCoordinateTransformer.ts
│   │   └── types.ts
│   │
│   ├── player/               ← was modules/player/ + modules/deck/
│   │   ├── Player.ts
│   │   ├── CardPile.ts
│   │   ├── Deck.ts
│   │   └── types.ts
│   │
│   ├── game-dock/            ← was modules/gameResourcesDock/
│   │   ├── GameDock.tsx           (convert class → single React component)
│   │   ├── HandCard.tsx
│   │   ├── HandCardsContainer.tsx
│   │   └── components/
│   │       ├── CardGrid.tsx
│   │       ├── PileViewer.tsx
│   │       └── SearchBar.tsx
│   │
│   ├── deck-manager/         ← was deck_manager/ (fix underscore)
│   │   ├── DeckManager.tsx
│   │   ├── DeckImportModal.tsx
│   │   ├── DeckImporter.ts
│   │   ├── DeckStorageService.ts
│   │   └── DeckPersistenceService.ts
│   │
│   ├── hotkeys/              ← was hooks/ + data/hotkeys.ts + components/GameHotkeysManager.tsx
│   │   ├── GameHotkeysManager.tsx
│   │   ├── HotkeysModal.tsx
│   │   ├── useAllGameHotkeys.ts
│   │   └── hotkeys.ts
│   │
│   ├── opponents/            ← was components/health/
│   │   ├── OpponentHealthList.tsx
│   │   └── EditableHealth.tsx
│   │
│   ├── card-preview/         ← was modules/cardPreview/ (finish React version)
│   │   └── CardPreview.tsx
│   │
│   ├── keyword-tokens/       ← was modules/keywordTokens/
│   │   ├── KeywordTokenFactory.ts
│   │   └── types.ts
│   │
│   └── room/                 ← was services/roomManager/
│       └── RoomManager.ts
│
├── infrastructure/
│   ├── networking/           ← was modules/yjs-networking/
│   ├── cards/                ← was services/cards/
│   ├── analytics/            ← was services/analytics/
│   └── persistence/          ← was services/deckStorage/ + services/deckPersistence/
│
├── shared/
│   ├── ui/                   ← shadcn components (was components/ui/)
│   ├── components/           ← generic reusable (ModalFooter, CardCounter, etc.)
│   └── utils/
│
├── app/
│   ├── App.tsx               ← actual React root (replace placeholder)
│   ├── providers.tsx          ← Yjs context, error boundary
│   └── main.ts               ← entry point (replaces index.ts god object)
│
└── constants.ts
```

---

## Migration Phases

### Phase 1 — File moves ✅ DONE
All files moved to feature-based directories, all imports updated, old directories deleted. Build passes (`npm run build` ✓). One pre-existing TypeScript error remains unrelated to refactor: `BoardInverter.tsx` references `YDOC_INVERTED_BOARDS` which isn't in constants yet.

Two pre-existing bugs also fixed along the way:
- `executeBattlefieldCardAction` was called with a spurious 5th `cardPreview` arg in `useAllGameHotkeys.ts` (function already gets it from the store)
- Same extra arg in `MultiPlayerBoardManager.test.ts`

**What was NOT moved (still needs work):**
- `src/components/` — still contains modals (WelcomeModal, HelpModal, AddCardManager, AnnouncementModal, PatchNotesModal, MobileWarningModal, AddCardModal, RoomConnectionStatus, KeywordTokenGrid, PlayerCounterModal, CardCounter, ModalFooter). These are re-exported from `components/index.ts` for backwards compat. Move generic ones to `src/shared/components/`, feature-specific ones to their feature dir (e.g. `WelcomeModal` → `src/features/room/` or `src/app/`).
- `src/services/eventHandlers/` — `WhiteboardEventHandlers.ts` bridges whiteboard, player, and token service. Should move to `src/features/battlefield/` or `src/features/game-dock/`.
- `src/services/announcements/` and `src/services/patchNotes/` — small services, move to `src/infrastructure/` or `src/shared/`.
- `src/stores/` — Zustand stores (playerStore, gameInstanceStore, hotkeyStore, uiStore). These are fine where they are or can move to `src/app/`.
- `src/data/defaultDeck.ts` — move to `src/features/deck-manager/`.
- `src/content/` — markdown files (announcement.md, help.md, patchNotes.md), move to `src/features/` subdirs as appropriate.
- `src/utils/centerHtmlElementOnDrag.ts` — move to `src/shared/utils/`.
- `src/index.ts` — still the God Object; target of Phase 5.
- `src/app/` — created but empty; target of Phase 5.

### Phase 2 — Delete dead code ✅ DONE (partial — see note)
- ✅ Deleted `src/features/battlefield/KeyboardHandler.ts` (not imported by production `MultiPlayerBoardManager`; `useAllGameHotkeys` fully replaced it). Also deleted its `KeyboardHandler.test.ts`, removed the `KeyboardHandlerCallbacks` re-export from `features/battlefield/index.ts`, and removed the `vi.mock('./KeyboardHandler')` block from `MultiPlayerBoardManager.test.ts`.
- ✅ Deleted `src/features/card-preview/CardPreviewWrapper.ts` (imported by nobody — genuinely dead).
- ✅ Deleted `src/App.tsx` placeholder ("React root mounted successfully!"), referenced by nobody.
- ⚠️ **NOT deleted: `src/features/card-preview/CardPreview.ts`** (imperative version). It is still live in production — `card-preview/index.ts` re-exports `CardPreview` from `./CardPreview` (resolves to the `.ts`), and `src/index.ts:201` does `new CardPreview()`, while `GameResourcesDock.ts` / `battlefieldCardActions.ts` use its imperative `show`/`hide`/`updatePosition` API. The `.tsx` is a props-based functional component, not a wired-in replacement. Deleting the `.ts` belongs to **Phase 3** (finish `CardPreview.tsx` + rewire callers, then delete the `.ts`).

Verified: `npm run build` ✓ and `tsc --noEmit` shows only the pre-existing `YDOC_INVERTED_BOARDS` error in `BoardInverter.tsx` (unrelated to this phase).

### Phase 3 — Replace imperative classes with React ✅ DONE
- ✅ **Mulligan confirm**: `window.confirm()` in `useAllGameHotkeys.ts` → `triggerConfirmation()` from `@/shared/utils/confirmation` (returns a Promise, so handled via `.then()`). Deleted the stale duplicate `src/utils/confirmation.tsx` (neither copy was imported; wired to the `shared/` one).
- ✅ **ZoomController.ts → ZoomControls.tsx**: created `features/battlefield/zoomStore.ts` (Zustand + `persist`, key `whiteboard-zoom`, clamp 0.5–2.5) and `ZoomControls.tsx` (reuses existing `.zoom-controls`/`.zoom-button`/`.zoom-display` CSS). `MultiPlayerBoardManager` no longer owns a `ZoomController`: it reads `useZoomStore.getState().zoomLevel`, re-applies sizing to all cards via `useZoomStore.subscribe(...)`, and gained a private `applyZoomToCard()`. Mounted via `createRoot` in `index.ts`. Deleted `ZoomController.ts` + `ZoomController.test.ts`.
- ✅ **CardPreview.ts → CardPreview.tsx**: created `features/card-preview/cardPreviewStore.ts` (card/visibility/mouse position + persisted zoom, key `card-preview-zoom`). Rewrote `CardPreview.tsx` as `<CardPreviewPopup>` + `<CardPreviewZoomControls>` reading the store (flip support via `card.isFlipped` → card-back image). Rewired all imperative callers to `useCardPreviewStore.getState()`: `MultiPlayerBoardManager`, `battlefieldCardActions`, `HandCardsContainer`, `CardGridItemReact`, `useAllGameHotkeys`. Removed `cardPreview` from `gameInstanceStore`. Mounted via `createRoot` in `index.ts`. Deleted the imperative `CardPreview.ts`.
- ✅ **TooltipManager.ts → Radix Popover**: replaced the imperative class with `features/hotkeys/hotkeyMenuStore.ts` (Zustand) + `HotkeyMenu.tsx` (one app-level `@radix-ui/react-popover`, mounted via `createRoot` in `index.ts`). Radix handles positioning/collision/Escape/click-outside. **Behavior change (requested):** card menus now open on **right-click** as a traditional context menu (no more hover/left-click) — actionable surfaces are battlefield cards (`onSelect` → `executeBattlefieldCardAction`) and pile-viewer cards (`CardGridItemReact`/`CardGrid`, new `onMenuSelect` prop → pile moves); battlefield tokens + token picker (`KeywordTokenGrid`) keep their hover *hint* (non-interactive `showHint`) and direct +1/−1/delete clicks. Rewired all consumers off `useTooltipStore`, dropped the dead `controlsTooltipManager` from `GameResourcesDock`, stripped `TooltipManager` from `uiStore`, and deleted `TooltipManager.ts` + `TooltipManager.test.ts`. (The dock's own hover hotkey hint still uses `HotkeyTooltip` directly — untouched.)

### Phase 4 — Eliminate `window` event bus ✅ DONE (card-movement events)
- ✅ **Battlefield → pile moves**: `moveCardToHand`/`moveCardToDiscard`/`moveCardToExile`/`moveCardToDeckTop`/`moveCardToDeckBottom` are now Zustand actions on `gameInstanceStore` (operate on the stored `player`/`roomManager`; deck moves also re-persist via `DeckPersistenceService`). `battlefieldCardActions` calls `useGameInstance.getState().moveCardTo…(card)` directly; the 5 `window.addEventListener` handlers in `index.ts` are deleted. The `moveCardToHand` action now goes through `player.placeCardInPile(card, 'hand')` instead of poking `yPlayerState['hand']` by hand.
- ✅ **Pile-viewer hotkey moves**: the `pileViewerCardAction` window event (the phase-4 TODO left in `useAllGameHotkeys`) is replaced by a tiny handler-registry store, `features/game-dock/pileViewerHotkeyStore.ts`. The open `PileViewerReact` registers its source-pile-bound move handler (`setActionHandler`) while `isOpen`; the hotkey layer invokes `usePileViewerHotkeyStore.getState().actionHandler?.(action, cardId)`. This keeps the viewer's card-list + callback closure as the single owner of the move (incl. its post-move `updatePileViewer` refresh).
- ✅ **`window.getGameResourcesDockHoverState()`**: already absent from production code — the hover state collapsed into `hotkeyStore.hoverTarget` during the Phase-3 hotkey work, and `useAllGameHotkeys` reads it from there. Only stale prose references remain (`features/game-dock/README.md`, the dead `features/battlefield/KeyboardHandler.md`, and a comment in `GameResourcesDock.test.ts` whose body mocks its own dock interface and tests `Player` directly) — doc debt, not code.

Verified: `tsc --noEmit` shows only the pre-existing `YDOC_INVERTED_BOARDS` error in `BoardInverter.tsx`; `npm run build` ✓; full vitest run ✓ (216 passed, 96 skipped, 0 failed).

**Out of scope (other window events, intentionally left):** `moveCardFromBattlefield` (board drag→pile, `MultiPlayerBoardManager`→`WhiteboardEventHandlers`), `playCard` (hand→board), `opponentBoardHover`/`opponentBoardPin`/`opponentCountChanged`, `modalOpen`/`modalClosed`, `scryViewer closing`. The plan scoped Phase 4 to the card-movement bus + dock hover state; these remaining events are separate concerns better untangled alongside Phase 5/6.

### Phase 5 — Collapse `index.ts` God Object ✅ DONE
- ✅ Deleted `src/index.ts` (571 lines) and `ReactToasterRoot.tsx`.
- ✅ **`src/app/main.ts`** — new entry point; Sentry/PostHog init, then `bootstrapGame()` + single `createRoot(<App/>)` into `#app-react-root`.
- ✅ **`src/app/bootstrap.ts`** — `bootstrapGame()` orchestrator: wires `Y.Doc`, networking, `Player`, `MultiPlayerBoardManager`, `GameResourcesDock`, services, populates stores, seeds/auto-loads deck. Deck domain logic in `features/deck-manager/deckLoading.ts`; room-link copy in `features/room/setupRoomLinkCopy.ts`.
- ✅ **`src/app/App.tsx`** — single React tree. Fixed-position overlays (`ZoomControls`, `CardPreview`, `HotkeyMenu`, `GameHotkeysManager`, `Toaster`, modals, `AddCardManager`) as direct children. Toolbar slots (`DeckManager`, `OpponentHealthList`, `RoomConnectionStatus`, `HelpButton`, `HotkeysButton`, `DiscordButton`) rendered via `createPortal` into existing `index.html` mount points.
- ✅ **`src/app/ToolbarButtons.tsx`** — `HelpButton`, `HotkeysButton`, `DiscordButton` components (extracted from inline definitions in the old `AuraApp`).
- ✅ `index.html` updated: entry point → `/src/app/main.ts`; `#toaster-root` removed; `#app-react-root` added.

Verified: `tsc --noEmit` shows only the pre-existing `YDOC_INVERTED_BOARDS` error in `BoardInverter.tsx`; `npm run build` ✓; full vitest run ✓ (216 passed, 96 skipped, 0 failed).

**Deferred to Phase 6:** `index.html` still retains hard-coded toolbar mount-point divs (`#deck-manager-root`, `#hotkeys-root`, `#help-root`, `#discord-root`, `#connection-status`, `#opponent-health-container`) that `App.tsx` targets with portals. When Phase 6 replaces the whiteboard, **fully restructure `index.html` down to a single `<div id="root">`** and let `<App>` render the entire toolbar/layout (board + dock via refs), dropping the portal indirection. The whiteboard DOM region is already being rewritten at that point, so it's the natural moment for the full restructure.

### Phase 6 — Whiteboard replacement ✅ DONE (partial)
- ✅ Replaced `MultiPlayerBoardManager` with `BattlefieldCanvas.tsx` (react-flow). Previous commit.
- ✅ **Removed portals**: `index.html` stripped to `#app-react-root` + `#local-dock`; `App.tsx` renders toolbar (`#toolbar`) and battlefield (`#whiteboard`) as inline children — no more `createPortal` calls.
- ✅ **`moveCardFromBattlefield` window event eliminated**: logic moved into `gameInstanceStore.moveCardFromBattlefield()`; `BattlefieldCanvas` calls it directly. `WhiteboardEventHandlers.ts` deleted.
- ✅ **`setupRoomLinkCopy.ts` eliminated**: replaced by `features/room/RoomLinkButton.tsx` (React component reading `useGameInstance`).
- ✅ **`touch-action: none`** added to `#whiteboard` CSS to fix mobile card-node drag.

Verified: `tsc --noEmit` shows only the pre-existing `YDOC_INVERTED_BOARDS` error; `npm run build` ✓; full vitest run ✓ (197 passed, 1 skipped).

**Still remaining:**
- `GameResourcesDock` is still an imperative class mounted into `#local-dock`. Converting it to a React component would let the dock be removed from `index.html` entirely.
- Window events that go through `GameResourcesDock` (`modalOpen`/`modalClosed`, `scryViewer closing`, `opponentBoardHover`/`opponentBoardPin`, `playCard`) are kept until the dock is converted.
- Ko-fi widget stays as a script in `index.html` (renders as a floating overlay, not inline).