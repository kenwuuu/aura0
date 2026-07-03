# E2E Harness for Autonomous Verification — Progress

## Status: starting Phase 0 (2026-07-03)

Branch: `e2e-harness-autonomy`. Full plan: `/Users/kenwu/.claude/plans/idempotent-dancing-panda.md`
(also mirrored here as context below). This is item 4 of
`claude_plans/verification_loop_autonomy.md` — the only remaining gap in
closing the verification loop for autonomous agents.

Decisions locked: CI = blocking `@smoke` gate + advisory full suite. State-based
(yDoc) assertions are **deferred** to a documented follow-up, not built this
round. Rebuilding the harness fresh on master, mining (not merging) the stale
`.claude/worktrees/e2e-tests` branch for DOM facts + helper shapes.

## Phase checklist

- [ ] **Phase 0** — Instrument product code: testids on battlefield card/token/
      pile nodes, health input, hand card, pile-viewer modal/card, deck-import
      trigger/modal; `data-rendering-complete` signal on pile-viewer grid.
- [ ] **Phase 1** — Harness layer (`tests/e2e/harness/`): fixtures rewrite,
      playwright.config cleanup, selectors, page objects/domain helpers,
      `mouseDrag` primitive, semantic waits, domain assertions, scenario library.
- [ ] **Phase 2** — Smoke suite (`@smoke`, ~5 specs) green locally.
- [ ] **Phase 3** — Rehab broader behavior suite onto the harness (advisory tier).
- [ ] **Phase 4** — CI wiring: `test:e2e`/`test:e2e:smoke` scripts,
      `e2e-smoke` (blocking) + `e2e-full` (advisory) jobs in `test.yml`.
- [ ] **Phase 5** — Docs: `docs/testing/e2e.md` contract, update `tests/testing.md`,
      pointer from `CLAUDE.md`.
- [ ] **Deferred (documented, not built)** — `window.__aura` yDoc accessor +
      `serializeGameState()` for state-based sync/persistence-race assertions.

## Log

- 2026-07-03: Plan approved. Branched `e2e-harness-autonomy` off master.
  Starting Phase 0.
