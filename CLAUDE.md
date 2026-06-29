# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Aura is a **peer-to-peer Magic: The Gathering tabletop app**. Players share a collaborative whiteboard via WebRTC — there is no backend for game state. All real-time sync uses **Yjs CRDTs** over **y-webrtc**. The only backend is a card-import API (Aura backend → Scryfall fallback).

## Commands

```bash
npm run dev          # start dev server at localhost:5173
npm run build        # production build
npm run test:run     # run unit tests once (vitest)
npm test             # vitest watch mode
npx vitest run src/path/to/file.test.ts   # single test file
npx playwright test  # e2e tests (requires dev server running)
npx tsc --noEmit     # type-check (one pre-existing error in BoardInverter.tsx — ignore it)
```

## Architecture

### Entry point flow
`src/app/main.ts` → `bootstrapGame()` (in `bootstrap.ts`) → mounts `<App>` into `#app-react-root`.

`bootstrapGame()` is the imperative wiring layer: it creates `Y.Doc`, networking, `Player`, `GameResourcesDock` (still an imperative class), and services in dependency order, then populates Zustand stores before React renders. Everything returned from `bootstrapGame()` is passed as props to `<App>`.

### State: two layers
1. **Yjs** — source of truth for all shared game state. Access via `yDoc.getMap(YDOC_*)` constants from `src/constants.ts`. Key maps: `YDOC_CARDS_ON_BOARD` (battlefield cards), `YDOC_KEYWORD_TOKENS` (board tokens), `YDOC_PLAYER(id)` (per-player state: hand, deck, health, etc.).
2. **Zustand** — UI-only state (`src/stores/`). `gameInstanceStore` holds `yDoc`, `player`, `playerId`, `roomManager` so hotkeys and components don't need prop-drilling. `hotkeyStore` tracks what's hovered (`hoverTarget`) and modal state. Never put game mutations in Zustand — they belong in Yjs.

### Feature directories (`src/features/`)
Each feature owns its UI, business logic, and types:
- `battlefield/` — `BattlefieldCanvas.tsx` (react-flow board), `useBattlefieldNodes.ts` (Yjs↔react-flow bridge), `nodes/` (CardNode, TokenNode), `battlefieldCardActions.ts`
- `game-dock/` — `GameResourcesDock.ts` (imperative class, mounts hand/pile UI), pile viewer, card grid
- `player/` — `Player.ts` (owns all pile mutations + Yjs writes), `CardPile.ts`, `Deck.ts`
- `hotkeys/` — `useAllGameHotkeys.ts` (single unified hook), `hotkeys.ts` (action→key bindings + `HotkeyContext`/`HotkeyScope`), `HotkeyMenu.tsx` (Radix Popover context menu)
- `deck-manager/` — deck import, storage, persistence
- `card-preview/` — `CardPreview.tsx` + `cardPreviewStore.ts` (Zustand, show/hide on hover)
- `keyword-tokens/` — token type definitions
- `opponents/` — opponent health display (Yjs-synced)

### Battlefield (react-flow)
`BattlefieldCanvas` wraps `<ReactFlow>` with controlled nodes driven by `useBattlefieldNodes`. The bridge observes `yCards`/`yTokens` and calls `setNodes`; drag writes back to Yjs only on `onNodeDragStop`. Board-to-dock card moves go through `gameInstanceStore.moveCardFromBattlefield`. Hand-to-board drops call `gameInstanceStore.playCardFromHand`; keyword-token drops are handled inside `BattlefieldCanvas.onDrop` via `screenToFlowPosition`.

### Hotkey system
`useAllGameHotkeys` (mounted in `<GameHotkeysManager>`) reads `hoverTarget` from `hotkeyStore` to route contextual actions to the right surface (battlefield card, hand card, pile, token). Modal state switches between `HotkeyScope.Board` and `HotkeyScope.PileViewer` via `react-hotkeys-hook`'s `<HotkeysProvider>`. The context menu (`HotkeyMenu`) is a Radix Popover opened imperatively via `useHotkeyMenuStore.getState().openMenu(...)`.

### Infrastructure (`src/infrastructure/`)
- `cards/` — `CardLookupService` (Aura API → Scryfall fallback), `TokenService` (MTG token creation)
- `networking/` — Yjs network factory (y-webrtc + y-websocket), player/peer ID persistence
- `persistence/` — deck storage (IndexedDB via `idb`), deck persistence per room

### Path aliases
`@/` maps to `src/`. Use it everywhere — no relative `../../` imports across features.

## Design Philosophy

**Extensible and self-documenting over simple.** When choosing where to put logic, prefer the location that makes the code correct by default for all future callers — not the one that's shortest. A store action like `playCardFromHand` names a complete game action; if callers have to remember to also trigger token creation afterward, the name lies and every new call-site is a latent bug.

**Complete semantic actions.** Store actions represent full game events with all their consequences. Side effects (token creation, analytics, persistence) belong inside the action, not scattered at call sites. This means: if you add a new way to play a card from hand (hotkey, pile drag, etc.), it gets token creation for free.

**Caller should not need to know implementation details.** If playing a card creates tokens, that is not the UI layer's concern. The UI layer says what happened (a card was played); the action layer decides what that means (place card + spawn related tokens).

**Yjs mutations always go through `Player`** for player-state (hand, deck, health). For battlefield objects, write directly to `yDoc.getMap(YDOC_CARDS_ON_BOARD)`. Never use `player.yPlayerState` directly from outside `Player.ts`.

**`GameResourcesDock` is still an imperative class** (not yet converted to React). It mounts into `#local-dock` in `index.html`. React components in the dock use `usePlayerStore` (which holds `yPlayerState`) for reactive updates.

**Window events still used** for battlefield→dock card moves (`moveCardFromBattlefield`). All other cross-module communication uses Zustand stores or direct Yjs access.

**`src/components/`** holds modals and cross-feature UI (used by more than one feature). Feature-specific UI belongs in `src/features/<feature>/`. Generic primitives and shadcn components belong in `src/shared/`.

## Testing

Unit tests: vitest + happy-dom + React Testing Library. Files live next to source (`*.test.ts` / `*.test.tsx`). Test helpers for Yjs: create a real `Y.Doc` rather than mocking it.

E2e tests: Playwright under `tests/e2e/`. See `tests/testing.md` for PileViewer patterns, dnd-kit drag simulation (use manual mouse events, not `dragTo()`), and card-grid batch-rendering waits.

## Additional Reference

- `@tests/testing.md` — PileViewer selectors, dnd-kit drag-and-drop patterns, batch-rendering waits
- `@src/infrastructure/cards/CLAUDE.md` — CardLookupService architecture (Aura→Scryfall fallback)
- `@claude_plans/react_refactor_screaming_architecture.md` — full migration plan and phase completion status
