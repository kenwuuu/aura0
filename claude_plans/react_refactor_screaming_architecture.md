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

### Phase 4 — Eliminate `window` event bus
Replace `window.dispatchEvent(CustomEvent(...))` for card movement events (moveCardToHand, moveCardToDiscard, moveCardToExile, moveCardToDeckTop, moveCardToDeckBottom) with direct Zustand actions in `gameInstanceStore`. Remove `window.getGameResourcesDockHoverState()` — keyboard handler can read from `hotkeyStore` instead.

### Phase 5 — Collapse `index.ts` God Object
Break `AuraApp` class into per-feature initializers. Make `App.tsx` the actual React tree root with a single `createRoot()`. Move Sentry/Posthog init into `app/main.ts`.

### Phase 6 — Whiteboard replacement
By this point `features/battlefield/` is cleanly isolated. The seams are:
- Input: receives cards from `yDoc.getMap(YDOC_CARDS_ON_BOARD)` (Yjs)
- Input: receives zoom preferences from Zustand
- Output: dispatches card actions via Zustand store actions
- Output: exposes `getZoomLevel()` for token placement

Swap in new canvas implementation (Konva, react-flow, custom `<canvas>`, etc.).