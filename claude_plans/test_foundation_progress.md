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
- [ ] Keep-as-is set confirmed green: `PlayerGameActions.test.ts`, `actionLog.test.ts`,
      `nodeAttachment.test.ts`, `usePlaymatNodes.test.ts`, `opponentPlayerMutations.test.ts`,
      `diceActions.test.ts`, `DeckListParser.test.ts`, `MtgTextListDeckImporter.test.ts`,
      `cardPreviewStore.test.ts`, ported node tests
- [ ] Fix flaky shuffle assertions: `Player.test.ts`, `Deck.test.ts` (deterministic multiset check)
- [ ] Fix `CardPreview.test.tsx` (drop querySelector/style reads, use role/text)
- [ ] Rewrite `DeckImportModal.test.tsx` on the harness
- [ ] Confirm no tests written around orphaned `CardCounter` path

## Phase 1 — Tier-1 logic coverage
- [ ] `Player` methods: drawCard, mulligan, shuffleDeck, setAllowViewHand/reveal, reorderHand,
      flipHandCard, modifyHealth/setHealth, movePileCard, addCustomCounter
- [ ] `battlefieldCardActions.test.ts`: untapAll, addCounter, tap/flip, moveTo*
- [ ] `spawnToken.test.ts`
- [ ] `gameActions.test.ts` (GAME_ACTIONS registry dispatch incl. pass)
- [ ] `settingsStore.test.ts`
- [ ] Extend `actionLog.test.ts` if new entry types appeared in the merge

## Phase 2 — Tier-2 component/seam coverage
- [ ] `HealthNode.test.tsx`
- [ ] `GameActionsToolbar.test.tsx` (highest-value UI test)
- [ ] `HandCardsContainer.test.tsx` / `FloatingHand`
- [ ] `ActionLogPanel.test.tsx`
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
