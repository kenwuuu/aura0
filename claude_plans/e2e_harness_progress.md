# E2E Harness for Autonomous Verification — Progress

## Status: Phase 1 done (2026-07-03), Phase 2 next

Branch: `e2e-harness-autonomy`. Full plan: `/Users/kenwu/.claude/plans/idempotent-dancing-panda.md`
(also mirrored here as context below). This is item 4 of
`claude_plans/verification_loop_autonomy.md` — the only remaining gap in
closing the verification loop for autonomous agents.

Decisions locked: CI = blocking `@smoke` gate + advisory full suite. State-based
(yDoc) assertions are **deferred** to a documented follow-up, not built this
round. Rebuilding the harness fresh on master, mining (not merging) the stale
`.claude/worktrees/e2e-tests` branch for DOM facts + helper shapes.

## Phase checklist

- [x] **Phase 0** — Instrument product code: testids on battlefield card/token/
      pile nodes, health input, hand card, pile-viewer modal/card, deck-import
      trigger/modal; `data-rendering-complete` signal on pile-viewer grid.
      Commit `e8c3cea`. 385/385 tests green, typecheck clean.
- [x] **Phase 1** — Harness layer (`tests/e2e/harness/`): fixtures rewrite,
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
- 2026-07-03: Phase 0 complete and committed (`e8c3cea`). Testids added:
  `battlefield-card`/`data-card-id` (CardNode), `battlefield-token`/
  `data-token-id` (TokenNode), `pile`/`data-pile-count` (PileNode, keeping
  existing `data-pile-type`/`data-pile-owner`), `health-value`+`aria-label`
  (EditableHealth), `hand-card` (HandCard, keeping `data-card-id`),
  `pile-viewer`/`data-pile-type` (PileViewerReact DialogContent),
  `pile-viewer-card` (CardGridItemReact, covers SortableCardGridItem too),
  `deck-import-open` (DeckManager button), `deck-import-modal`
  (DeckImportModal Dialog.Content). `data-rendering-complete`/
  `data-rendered-count`/`data-cards-total` added to both CardGrid grid divs
  (static + sortable path) — computed from existing `visibleCardCount`/
  `localCards.length`, no new prop needed.
- 2026-07-03: Phase 1 complete. Built `tests/e2e/harness/`: `selectors.ts`
  (testid map), `pageObjects.ts` (boardCard/boardToken/pileTile/pileCount/
  handCard/healthInput/pileViewer/whiteboard — all keyed off Phase-0 testids,
  never raw strings in specs), `interactions.ts` (`mouseDrag` primitive kept
  byte-for-byte from the worktree recipe; `visibleHandCard` hit-test;
  `playHandCardToBoard`, `dragBoardCardToPile/Hand`, `dragCountedTokenToBoard`
  — the one sanctioned `.dragTo()` use, for native-HTML5-draggable drawer
  tokens; `drawCard`; `importDeck`), `waits.ts` (`waitForPileViewerReady` off
  `data-rendering-complete`; `waitForSync` polling `health-value` input count),
  `assertions.ts`, `scenarios.ts` (`importOneCardDeck`, `drawOpeningHand`,
  `playCreature`, `moveBetweenZones`, `reloadAndResync`, `connectSecondPlayer`),
  `network.ts` (`blockAnalytics` — see flakiness note below), `index.ts` barrel.
  Rewrote `tests/e2e/fixtures.ts`'s readiness gate off `health-value`/`hand-card`
  testids (the `#local-dock` gate is gone for good). Cleaned
  `playwright.config.ts`: dropped the orphan `setup` project and the
  `storageState` (app has no auth); reporter is `list` on CI, HTML locally.
  **Found and fixed a real flakiness source while dogfooding the harness**: a
  live PostHog experiment (`network-transport-websocket`, in
  `FeatureFlags.ts`) can route a session to the `websocket` Yjs transport
  instead of `webrtc`; that relay (`wss://ws.aura0.app`) is currently
  returning Cloudflare 530s. `blockAnalytics()` aborts PostHog network calls
  in tests so every session falls through the flag's 1.5s timeout to the
  `webrtc` default — deterministic, and stops E2E runs from firing real
  analytics events. Confirmed via a throwaway two-context Node/Playwright
  script (not committed) that real WebRTC sync itself is fine (~5-10s) once
  transport is pinned. Bug lives in product code (`FeatureFlags.ts` /
  infra) — out of scope to fix this round; harness-side block is the correct
  E2E-side mitigation regardless of whether/when that's fixed upstream.
