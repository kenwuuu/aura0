# Test Foundation → CD Confidence: Progress Log

Tracks execution of `/Users/kenwu/.claude/plans/jiggly-meandering-rose.md`.
Branch: `feature/manabase-design-system` (unified trunk after Phase 0 merge).

## Status legend
- [ ] not started · [~] in progress · [x] done

---

## Phase 0 — Unify the branch
- [x] Merge `master` → `feature/manabase-design-system` (git auto-resolved cleanly, no manual
      conflict markers needed in `GameActionsToolbar.tsx`)
- [x] `npx tsc --noEmit` clean (0 errors — the previously-noted BoardInverter.tsx error is gone)
- [x] `npm run test:run` green — 22 files, 285 passed, 1 pre-existing skip (unrelated, see below)
- [x] Confirm `src/test/setup.ts` central `afterEach` resets every store touched by new tests —
      audited all `zustand` stores in the repo, found 6 uncovered (settingsStore,
      pileViewerHotkeyStore, scryStore, surveilStore, tokenCardSearchStore, numberPromptStore),
      added resets for all proactively (Phase 1/2 will touch several of these). Also added
      `localStorage.clear()` since settingsStore uses `persist`. Committed `0039f80`.

## Existing-test audit
- [x] Keep-as-is set confirmed green: `PlayerGameActions.test.ts`, `actionLog.test.ts`,
      `nodeAttachment.test.ts`, `usePlaymatNodes.test.ts`, `opponentPlayerMutations.test.ts`,
      `diceActions.test.ts`, `DeckListParser.test.ts`, `MtgTextListDeckImporter.test.ts`,
      `cardPreviewStore.test.ts`, ported node tests
- [x] Fix flaky shuffle assertions: `Player.test.ts`, `Deck.test.ts`/`CardPile.test.ts`
      (deterministic multiset + seeded-RNG-order check). Also discovered `Deck`'s runtime
      methods (shuffle/draw/add/remove) are dead code — only constructor + `getCards()` are
      used in production (via `Player.ts`/`DeckPersistenceService.ts`); `CardPile` is the real
      runtime pile class. Trimmed `Deck.test.ts` to constructor+getCards (~60 → 14 tests) and
      wrote a new `CardPile.test.ts` (19 tests) covering the actual mutation surface. Added
      `src/test/seededRandom.ts` (mulberry32) so shuffle tests assert "order changed"
      deterministically instead of probabilistically — a constant-0 mock was tried first and
      degenerated Fisher-Yates into a plain reversal for sorted input, so seeded was necessary,
      not just nice-to-have.
- [x] Fix `CardPreview.test.tsx` (drop querySelector/style reads, use role/text). Extracted the
      inline left/right placement math into `cardPreviewLogic.ts` (`shouldShowOnLeft`) with its
      own `cardPreviewLogic.test.ts` (4 tests, pure logic, no render). Simplified
      `CardPreview.test.tsx`'s "left/right placement" describe block to a single wiring-seam test
      (renders correctly regardless of cursor position) now that the geometry is covered at the
      logic tier. Also removed the redundant manual `useCardPreviewStore.setState(...)` +
      `localStorage.clear()` in its `beforeEach` — both are already handled by the central
      `afterEach` in `src/test/setup.ts`.
- [x] Rewrite `DeckImportModal.test.tsx` on the harness — already rebuilt in a prior session
      (commit `9d4e73a`): good label/role queries, no index-based selectors, documents a Radix
      nested-dialog `aria-hidden` gotcha. Only covers Help-dialog wiring (8 tests) today; the
      core import flow (validation, `handleImport`, progress, cancel) needs I/O mocks
      (`MtgTextListDeckImporter`, `DeckStorageService`) and a render, so that expansion is
      Tier-2 work — tracked under Phase 2, not re-done here.
- [x] Confirm no tests written around orphaned `CardCounter` path — grepped the repo, zero
      references in any `*.test.ts(x)`. Nothing to delete.

## Phase 1 — Tier-1 logic coverage
- [x] `Player` methods: drawCard, mulligan, shuffleDeck, setAllowViewHand/reveal, reorderHand,
      flipHandCard, modifyHealth/setHealth, movePileCard, addCustomCounter — extended
      `Player.test.ts` with 18 new tests: setAllowViewHand/getAllowViewHand, reorderHand,
      flipHandCard, movePileCard (incl. "top of deck" vs "bottom of deck" log text branches),
      drawCardFromPile/removeCardFromPileById, and addCustomCounter/modifyCustomCounter/
      removeCustomCounter (incl. the 500ms debounced counter-change log via `vi.useFakeTimers`).
- [x] `battlefieldCardActions.test.ts` — untapAll (+ownership filter), tap, flip (face-down hides
      the name / face-up reveals it), copy, addCounter, delete, and all 5 moveTo* cases incl.
      token detachment. moveTo* tests wire a real `seedGame()` player into `useGameInstance` since
      those branches delegate through the Zustand store to `Player`.
- [x] `spawnToken.test.ts` — token shape/position, parent-attachment via `findParent`, zIndex
      stacking above the max of cards+tokens, and the `spawn_token` log entry; plus
      `getMaxZIndex` directly.
- [x] `gameActions.test.ts` — registry shape (unique ids, known surfaces) + dispatch contract for
      every action: untap-all, draw, pass (log-only, verified no player-state side effect),
      draw-x/mill (number-prompt open + onConfirm effect), exile-top, random-discard,
      reveal-hand (both toggle directions + log text), shuffle, mulligan, scry/surveil,
      look-at-top (async dynamic-import path, awaited via `vi.waitFor`), create-token-card, and
      the disabled create-token/create-label no-ops.
- [x] `settingsStore.test.ts` — setHandZoom/setPreviewZoom clamping at both bounds,
      setSnapToGridEnabled, setDemoHandCards, and the legacy-key migration seed (`hand-zoom`/
      `card-preview-zoom` → clamped initial state) via `vi.resetModules()` + dynamic re-import.
- [x] Extend `actionLog.test.ts` if new entry types appeared in the merge — already confirmed
      during the audit that the test is generic and doesn't enumerate `ActionLogType`, so the
      merge's new `'counter'` type needed no update.

## Phase 2 — Tier-2 component/seam coverage
- [x] `HealthNode.test.tsx` — health inc/dec routes to `Player` (local) vs directly to the
      opponent's Yjs map via `opponentPlayerMutations` (opponent), and rename affordance
      present/absent per variant. Kept intentionally scoped to the routing seam — the mutation
      logic itself (`Player.addCustomCounter` family, `modifyOpponentHealth` debounce) already
      has dedicated Tier-1 coverage. While here, found `addOpponentCounter`/
      `modifyOpponentCounter`/`removeOpponentCounter` had zero test coverage (the existing
      `opponentPlayerMutations.test.ts` only covered the health debounce) — added 4 tests for
      those directly rather than through HealthNode's hover-gated counter UI, which would have
      needed brittle structural queries to trigger.
- [x] `GameActionsToolbar.test.tsx` — one representative action per surface (toolbar button:
      Draw/Untap All/Pass, Actions dropdown: Mulligan, Create dropdown: Token Card), plus the
      ctx-not-ready guard (renders nothing before the game instance is seeded). Confirmed Radix
      `DropdownMenu`/`Popover` work fine under happy-dom with plain `userEvent.click` — no
      pointer-capture polyfill needed, unlike the common jsdom gotcha. Per-action dispatch
      contract is already covered at Tier-1 (`gameActions.test.ts`), so this file deliberately
      doesn't re-test every action — only proves the wiring seam once per surface.
- [x] `FloatingHand.test.tsx` — renders seeded hand cards by alt text; ctx-not-ready guard;
      handZoom reflected into the `--card-zoom` CSS var (the actual mechanism `style.css`
      uses to scale cards, confirmed by grep — not an arbitrary style read); hover sets
      `hotkeyStore.hoverTarget` + shows `cardPreviewStore`, unhover clears both (confirmed
      `useSortable` from dnd-kit renders fine with no `DndContext` ancestor, and that a
      `userEvent.hover` on a nested `<img>` still fires the ancestor div's `onMouseEnter` since
      the pointer crosses that div's boundary — a different case from the earlier HealthNode
      finding, which was about two *sibling* elements each needing their own handler); the
      `demoHandCards` fallback only applies when the real hand is empty. Added a
      `data-testid="hand-cards-container"` to `HandCardsContainer.tsx` (mirrors
      `GameActionsToolbar`'s existing `data-testid`) to give the zoom check a stable seam.
      Tested at the `FloatingHand` level (not raw `HandCardsContainer`) since that's the
      store-wired composition root, matching the `HealthNode`/`renderNode` precedent of testing
      the real wiring rather than a prop-driven leaf.
- [x] `ActionLogPanel.test.tsx` — empty-state placeholder, entries render by resolved actor
      name/text in document order (via `compareDocumentPosition`, not index-based
      `getAllByText()[n]`), the unnamed-actor id-truncation fallback, live updates as new
      entries are logged to the same `Y.Doc` (had to wrap the direct `logAction` call in
      `act(...)` — calling it outside `userEvent`, which auto-wraps, left the Yjs-observer-driven
      `setState` outside React's act boundary), and collapse/re-expand on header click.
- [ ] `SettingsModal` display section
- [ ] `DeckImportModal.test.tsx` rewrite (may already be covered by audit item)

## Phase 3 — CD gates
- [ ] `vitest.config.ts` coverage.thresholds scoped to critical modules (>=80%)
- [ ] `npm run test:coverage` wired into CI
- [ ] Zero `.skip` in suite
- [ ] Confirm `.github/workflows/test.yml` required check still green
- [ ] Manual sanity: `npm run dev`, draw/play/pile/action-log check

## Out of scope (explicit non-goals this pass)
- E2E rehabilitation → `worktree-e2e-tests`
- Onboarding flow tests (not yet built)
- Networking refactor unit tests (I/O boundary, covered via E2E smoke)

---

## Log
- 2026-07-03: Checked out `feature/manabase-design-system` in main worktree (was on `master`,
  clean). Confirmed merge-base `8be8c7f`; master 3 ahead / feature 6 ahead. Starting Phase 0 merge.
- 2026-07-03: Phase 0 merge done. `git merge master --no-edit` auto-resolved the
  `GameActionsToolbar.tsx` line entirely (git's ort strategy merged both hunks without markers).
  tsc clean, full suite green (285/285, 1 pre-existing skip in `DeckListParser.test.ts` for a
  known set-formatting parser limitation — not introduced by this branch, left as-is).
  Merge commit is on top of `bf48180`, pulling in the networking cleanup, add-counter action,
  and health-logging commits from master. Merge commit: `f036068`.
- 2026-07-03: Audited all Zustand stores repo-wide, added 6 missing resets + localStorage.clear()
  to `src/test/setup.ts`. tsc clean, suite still 285/285 green. Committed `0039f80`.
  **Phase 0 complete.** Starting existing-test audit next.
- 2026-07-03: Deck/CardPile audit. Confirmed `Deck`'s non-constructor methods are dead code
  (superseded at runtime by `CardPile`). Trimmed `Deck.test.ts` (60→14 tests), added
  `CardPile.test.ts` (19 tests), added `seededRandom.ts` and fixed 4 probabilistic shuffle
  assertions in `Player.test.ts` plus 1 in `CardPile.test.ts`. Full suite: 258/258 passing
  (285 − 46 deleted dead-code tests + 19 new CardPile tests), stable across repeated runs.
  Next: `CardPreview.test.tsx` (extract placement logic, drop querySelector/style reads).
- 2026-07-03: `CardPreview.test.tsx` fix done. New `cardPreviewLogic.ts`/`.test.ts` (pure
  `shouldShowOnLeft`), redundant per-test store resets removed. tsc clean, full suite
  261/261 green (258 + 4 new logic tests − 1 folded placement test = net +3).
- 2026-07-03: Confirmed `DeckImportModal.test.tsx` already meets convention (prior-session
  rewrite); deferred the import-flow coverage expansion to Phase 2 rather than duplicating work.
  Grepped for orphaned `CardCounter` test references — none found. **Existing-test audit
  complete — Task #2 done.** Starting Phase 1 (Tier-1 logic coverage) next.
- 2026-07-03: Phase 1 done. Added 18 tests to `Player.test.ts` (hand ops, pile moves, custom
  counters), plus 4 new files: `battlefieldCardActions.test.ts` (15 tests), `spawnToken.test.ts`
  (7), `gameActions.test.ts` (18 — full GAME_ACTIONS dispatch contract), `settingsStore.test.ts`
  (11, incl. legacy-key migration via `vi.resetModules()`). `actionLog.test.ts` needed no
  changes (already generic re: entry types). tsc clean; full suite 329/329 green (was 261),
  stable across 3 consecutive runs. **Phase 1 complete.** Starting Phase 2 (Tier-2 component/
  seam coverage) next.
- 2026-07-03: `HealthNode.test.tsx` added (4 tests, routing seam only: local→Player,
  opponent→opponentPlayerMutations, both for health +/- and the rename affordance). Also closed
  a coverage gap found along the way: `addOpponentCounter`/`modifyOpponentCounter`/
  `removeOpponentCounter` had no tests at all — added 4 directly to
  `opponentPlayerMutations.test.ts` rather than through HealthNode's hover-gated counter UI.
  tsc clean, full suite 337/337 green. Next: `GameActionsToolbar.test.tsx` (highest-value UI
  test per the plan).
- 2026-07-03: `GameActionsToolbar.test.tsx` added (6 tests). tsc clean, full suite 343/343
  green, stable across 3 consecutive runs. Next: `HandCardsContainer.test.tsx`/`FloatingHand`.
- 2026-07-03: `FloatingHand.test.tsx` added (6 tests), plus a `data-testid` added to
  `HandCardsContainer.tsx` to support the handZoom check. tsc clean, full suite 349/349 green,
  stable across 3 consecutive runs. Next: `ActionLogPanel.test.tsx`.
- 2026-07-03: `ActionLogPanel.test.tsx` added (5 tests). tsc clean, full suite 354/354 green,
  stable across 3 consecutive runs. Next: `SettingsModal` display section.
