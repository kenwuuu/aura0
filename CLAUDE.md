# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Aura is a **Magic: The Gathering tabletop app**. Game state is stored in **Yjs CRDTs**. The
only backend is a card-import API (Aura backend → Scryfall fallback) and the
WebSocket server that both live on the same DigitalOcean server. That
backend lives in this repo at `mtg_card_search/`

## Commands

```bash
npm run dev             # start dev server at localhost:5173
npm run build           # production build
npm run test:run        # run unit tests once (vitest)
npm run test:coverage   # vitest run --coverage
npm run test:e2e:smoke  # the 5 @smoke specs only
npm run test:e2e        # the full e2e suite (what CI gates on)
npm run verify          # fast gate: typecheck + unit + build + @smoke only.
                        # NOT the full e2e suite — run test:e2e before pushing
                        # anything touching a shared call site.
npm test                # vitest watch mode
npx vitest run src/path/to/file.test.ts   # single test file
npx playwright test     # e2e tests (requires dev server running)
npx tsc --noEmit        # type-check
```

## Branch workflow

**Before starting any work, start a new worktree and brach off of `staging`. Open PRs into `staging`.** 
Never work off `master` or
target it directly. `staging` is the long-lived integration branch (and the
repo default), so `git clone` / new branches start there by default:

```bash
git switch staging && git pull
git switch -c feature/x     # do the work, then open a PR into staging
```

## Architecture

### Entry point flow
`src/app/main.ts` → `bootstrapGame()` (in `bootstrap.ts`) → mounts `<App>` into `#app-react-root`.

`bootstrapGame()` is the imperative wiring layer: it creates `Y.Doc`, networking, `Player`, and services in dependency order, then populates Zustand stores before React renders. Everything returned from `bootstrapGame()` is passed as props to `<App>`.

Bootstrap is the *only* imperative layer, and UI is a single React tree — no imperative UI classes. Mount new surfaces normally in the tree rather than reaching for a detached root.

One holdout: `shared/utils/confirmation.tsx` still mounts a throwaway `createRoot` per call, because `triggerConfirmation()` is promise-based and gets called from non-React code. Follow it only if you have that same constraint.

### State: two layers
1. **Yjs** — source of truth for all shared game state. Access via `yDoc.getMap(YDOC_*)` constants from `src/constants.ts`. Key maps: `YDOC_CARDS_ON_BOARD` (battlefield cards), `YDOC_KEYWORD_TOKENS` (board tokens), `YDOC_PLAYER(id)` (per-player state: hand, deck, health, etc.).
2. **Zustand** — UI-only state (`src/app/stores/`). `gameInstanceStore` holds `yDoc`, `player`, `playerId`, `roomManager` so hotkeys and components don't need prop-drilling. `hotkeyStore` tracks what's hovered (`hoverTarget`) and modal state. Never put game mutations in Zustand — they belong in Yjs.

### Hotkey system
`useAllGameHotkeys` (mounted in `<GameHotkeysManager>`) reads `hoverTarget` from `hotkeyStore` to route contextual actions to the right surface (battlefield card, hand card, pile, token). Modal state switches between `HotkeyScope.Board` and `HotkeyScope.PileViewer` via `react-hotkeys-hook`'s `<HotkeysProvider>`. The context menu (`GameContextMenu`) is a Radix Popover opened imperatively via `useContextMenuStore.getState().openMenu(...)`.

### Path aliases
`@/` maps to `src/`. Use it everywhere — no relative `../../` imports across features.

## Design Philosophy

**Extensible and self-documenting over simple.** When choosing where to put logic, prefer the location that makes the code correct by default for all future callers — not the one that's shortest. An action like `playCardFromHand` names a complete game action; if callers have to remember to also trigger token creation afterward, the name lies and every new call-site is a latent bug.

**Complete semantic actions.** Store actions represent full game events with all their consequences. Side effects (token creation, analytics, persistence) belong inside the action, not scattered at call sites. This means: if you add a new way to play a card from hand (hotkey, pile drag, etc.), it gets token creation for free.

**Caller should not need to know implementation details.** If playing a card creates tokens, that is not the UI layer's concern. The UI layer says what happened (a card was played); the action layer decides what that means (place card + spawn related tokens).

**Yjs mutations always go through `Player`** for player-state (hand, deck, health). For battlefield objects, write directly to `yDoc.getMap(YDOC_CARDS_ON_BOARD)`. Never use `player.yPlayerState` directly from outside `Player.ts`.

**No window events for cross-module communication.** Cross-module calls go through Zustand stores, direct Yjs access, or plain component state — never a `CustomEvent` on `window`.

**Where UI goes.** Feature-specific UI belongs in `src/features/<feature>/`. Generic primitives and shadcn components belong in `src/shared/`. App-shell composition — the toolbar, root-mounted modals, the stores that wire features together — belongs in `src/app/`.

## Testing

Unit tests: vitest + happy-dom + React Testing Library. Files live next to source (`*.test.ts` / `*.test.tsx`). Test helpers for Yjs: create a real `Y.Doc` rather than mocking it. Conventions (query ladder, mocking policy, harness, reference examples) are in `tests/testing-react.md` — follow `CardPreview.test.tsx`, not `DeckImportModal.test.tsx`.

E2e tests: Playwright under `tests/e2e/`. Write specs through `tests/e2e/harness/` (page objects, interactions, semantic waits, domain assertions, scenarios) — never raw selectors, `dragTo()`, `waitForTimeout`, or mouse teleports (`locator.click()`/`page.mouse.click()` jump straight to the target; hover-sensitive interactions need real incremental `page.mouse.move(x, y, { steps: N })` travel — see `mouseDrag`). Full contract in `docs/testing/e2e.md`; `tests/testing.md` has PileViewer/dnd-kit mechanics notes.

## Additional Reference

- `@tests/testing-react.md` — unit/component test conventions: query ladder, real-Yjs rule, mocking policy, harness
- `@docs/testing/e2e.md` — E2E testing contract: harness-first rules, banned patterns, CI wiring, deferred state-assertion design
- `@tests/testing.md` — PileViewer selectors, dnd-kit drag-and-drop mechanics
