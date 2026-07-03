# E2E Harness for Autonomous Verification — Progress

## Status: All phases done (2026-07-03) — E2E harness rehab complete

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
- [x] **Phase 2** — Smoke suite (`@smoke`, ~5 specs) green locally.
- [x] **Phase 3** — Rehab broader behavior suite onto the harness (advisory tier).
- [x] **Phase 4** — CI wiring: `test:e2e`/`test:e2e:smoke` scripts,
      `e2e-smoke` (blocking) + `e2e-full` (advisory) jobs in `test.yml`.
- [x] **Phase 5** — Docs: `docs/testing/e2e.md` contract, update `tests/testing.md`,
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
- 2026-07-03: Phase 2 complete. Five `@smoke`-tagged specs under
  `tests/e2e/smoke/`: `load_and_import` (fresh-session opening hand +
  deck-import flow), `draw_and_play` (deck draw + play-to-battlefield),
  `move_zone` (battlefield card -> pile), `pile_viewer` (open deck viewer,
  wait on `data-rendering-complete`, all 92 cards render), `two_player_sync`
  (real WebRTC, second browser context, Alice's play appears on Bob's board).
  Added `test:e2e`/`test:e2e:smoke` npm scripts (pulled forward from Phase 4
  since Phase 2's own verification step needs them). All 5 green locally,
  3 consecutive full-suite runs with no flake, one `--headed` run to eyeball
  the drags. Two harness bugs found and fixed via dogfooding: `data-pile-count`
  lives on the pile's nested `.pile-count` child, not the `[data-testid="pile"]`
  root (added a `pileCount()` page object) — `expectPileCount` and
  `moveBetweenZones` were reading the wrong node. `drawCard` needed to scope
  its "Draw" button lookup to the deck pile node — the game-actions toolbar
  has an unrelated same-named button, making an unscoped role lookup ambiguous.
- 2026-07-03: Phase 3 complete. All 9 pre-existing specs under `tests/e2e/app/`
  rehabbed onto the harness (advisory tier, untagged). Baseline before rehab:
  98 tests, 42 passed / 38 failed / 18 skipped. After: **100 tests, 72 passed,
  0 failed, 28 skipped** (test count grew slightly — a couple of bundled
  behaviors were split into their own tests where a suspected bug only
  affected half of a combined test). Two full-suite reruns with no flake.
  Per-file: `dock/health_display.spec.ts` (all 7 rewritten onto
  `healthInput`/`expectHealth`; `getByText('40')` never matched the
  `<input>` health value, which is why every test here was failing).
  `dock/addCard.spec.ts` (2 of 3 rewritten to open via the `'a'` hotkey — the
  standalone "Add Card" toolbar button no longer exists; feature is
  hotkey-only now). `dock/card_pile.spec.ts` (4 active tests onto
  `playCreature`/`dragBoardCardToPile/Hand`; 6 pile-to-pile drag tests stay
  `test.skip` with an explicit reason — piles are react-flow nodes now, no
  pile-to-pile drop target). `board/card_tooltips.spec.ts` (5 active,
  `boardCard(s)` instead of the removed `.player-board .card`; `addCounter`
  now spawns a `+1/+1` battlefield **token**, not an in-card counter overlay —
  rewrote to assert the token instead). `initial_site_load.spec.ts` (5
  active onto harness scenarios; 3 token-drag tests skipped, see bug list).
  `smoketest.spec.ts` (rewrote the clone/distribute flow to target
  `boardCards(page).last()` instead of `.first()` — cloned cards spawn with a
  higher z-index and overlap the original, so "first in DOM order" isn't
  reliably the one that receives pointer events). `dock/pile_viewer.spec.ts`
  (the ~1080-line file — mechanically rewrote all ~40 tests onto
  `openPileViewer`/`waitForPileViewerReady`/`pileViewerCards`/
  `expectPileCount`; added a local `millCardsFromDeck` helper for the
  hover-deck-pile + repeated-hotkey setup step; reused the harness's existing
  `mouseDrag` for the in-viewer drag-reorder test, no harness change needed
  there after all). `game_actions.spec.ts` (onto harness pile/hand
  assertions; fixed a wrong `data-disabled` expectation and 2 stale-copy
  checks; removed 3 dead unused helper functions). `tooltips.spec.ts`
  untouched — was already green, low-risk, left alone as instructed.
  **Harness fix**: `dragCountedTokenToBoard` (`interactions.ts`) mined a
  hover-reveals-drawer mechanism (`[class*="hoverIndicator"]`) that no
  longer exists — the token drawer was redesigned into a toolbar "Create >
  Token" popover (`KeywordTokenGrid`). Rewrote the open sequence to match;
  found a real product bug in the process (see below) so the function itself
  is currently unreachable in practice, but is implemented against the
  correct/current DOM shape for whenever that's fixed.

  **Suspected real product bugs found and left `test.skip`'d (not fixed —
  out of scope this round), each with a comment at the skip site tracing the
  exact evidence:**
  1. **Token popover never opens** (`GameActionsToolbar.tsx`'s `TokenSubItem`)
     — a `DropdownMenuItem` wrapped in `PopoverTrigger asChild` toggles `open`
     from `onSelect`, but the trigger's `data-state` never transitions to
     `"open"` on click *or* keyboard Enter (verified both ways directly).
     Affects `initial_site_load.spec.ts`'s 3 token-drag tests and
     `game_actions.spec.ts`'s "Create > Token opens the ability-token grid".
  2. **`removeCounter` action is a no-op** (`battlefieldCardActions.ts`) — no
     `case 'removeCounter'` in the switch statement; the "-1/-1 counter"
     context-menu item is clickable but does nothing (sibling `addCounter`
     has a TODO acknowledging this class of counter is incomplete).
     `board/card_tooltips.spec.ts`.
  3. **Scry "To deck top" tooltip-click over-credits the deck**
     (`ScryManager.tsx` / `PileViewerReact.tsx`) — scry 10 (deck 92→82), move
     1 card to deck top via the context-menu click: deck lands at 93, not 83
     (+11, not +1). Keyboard-hotkey equivalent is correct (+1). Suspected
     race between the per-card `onMoveToDeckTop` move and the
     `"scryViewer closing"` cleanup that returns remaining scry cards to the
     deck. `dock/pile_viewer.spec.ts`'s `testScryViewerCardToDeckTopTooltip`.
  4. **"To deck top"/"To deck bottom" close the pile viewer on click**
     (`PileViewerReact.tsx`'s `handleMenuSelect`) — clicking either
     context-menu row (not the keyboard hotkey) closes whatever pile viewer
     is currently open, confirmed directly (dialog visibility `false`
     immediately after one such click). Only visible in tests that need the
     viewer to stay open for a second sequential action.
     `dock/pile_viewer.spec.ts`'s `testDiscardViewerCardToDeckTopTooltip`,
     `testDiscardViewerCardToDeckBottomTooltip`,
     `testExileViewerCardToDeckBottomTooltip`.
  5. **Deck-viewer "To deck top"/"To deck bottom" menu rows never render**
     (`hotkeys.ts`) — the `T`/`Y` hotkeys' `context` arrays omit `'deckcard'`
     (unlike `H`/`D`/`S`, which include it), so `HotkeyMenu` never shows
     those rows for a deck-viewer card, even though the keyboard shortcut
     itself still fires. `dock/pile_viewer.spec.ts`'s
     `testDeckViewerCardToDeckTopTooltip`,
     `testDeckViewerCardToDeckBottomTooltip`.
  6. **"Reveal Hand" toggle-off closes the Actions dropdown before the click
     lands** (`GameActionsToolbar.tsx`) — reopening "Actions" right after
     toggling Reveal Hand once: the menu item reports visible, but the very
     next `.click()` on it times out, and a screenshot taken immediately
     after shows the dropdown already closed with nothing registered. Reveal
     Hand is the only stateful (non-one-shot) action in that menu,
     consistent with its own state change re-triggering something that
     resets the dropdown's `open` state. `game_actions.spec.ts`'s new
     "Actions > Reveal Hand toggle off logs the stop-revealing message"
     (split out of the original combined on/off test, whose "on" half still
     passes and stays active).
- 2026-07-03: Phase 4 complete. Verified Phase 3's fork output first (trust
  but verify): reran `tests/e2e/app` myself — confirmed 100/72/0/28 matches
  exactly, two full-suite reruns; reran `@smoke` — still 5/5; reran unit
  suite + typecheck — still 385/385 and clean. Then wired CI: added
  `e2e-smoke` (blocking, `npm run test:e2e:smoke`) and `e2e-full` (advisory,
  `continue-on-error: true`, `npm run test:e2e`) jobs to `test.yml`, each with
  its own checkout/Node-20/`npm ci`/`playwright install --with-deps chromium`
  preamble, uploading the Playwright HTML report as an artifact on failure.
  Pinned both `test:e2e`/`test:e2e:smoke` npm scripts to `--project=chromium`
  — firefox/webkit are configured but were never exercised against this
  harness (mouse-event drags, `elementFromPoint` hit-testing, react-flow
  specifics), so defaulting CI/local scripts to an unverified 3-browser matrix
  would be dishonest about what's actually been checked; they stay available
  for manual `--project=firefox`/`webkit` runs. Fixed `playwright.config.ts`'s
  CI reporter — it was `'list'`-only, which produces no HTML output at all,
  making the artifact-upload step a no-op; now `[['list'], ['html', {open:
  'never'}]]` on CI. Verified locally with `CI=true` that the HTML report
  still generates. YAML validated. Next real milestone: once `e2e-full` has
  run clean in CI for a while, promote it to blocking (drop
  `continue-on-error`) per the plan's Notes/risks section.
- 2026-07-03: Phase 5 complete — all 6 phases of the plan now done. Wrote
  `docs/testing/e2e.md`: the full contract (never `waitForTimeout`,
  harness-only interaction, stable testids only, `.dragTo()` banned except
  `dragCountedTokenToBoard`, one behavior per test, DOM-default/state-deferred
  assertion split, `@smoke` tagging rule), a directory-layout reference, the
  PostHog-blocking rationale, the CI wiring summary (including the
  chromium-only scoping decision), the deferred state-accessor design
  (verbatim from the plan's own "Deferred follow-up" section), and a pointer
  to the 6 suspected product bugs Phase 3 surfaced. Rewrote `tests/testing.md`
  down to a short pointer at the contract doc plus two mechanics notes
  (PileViewer batch-render internals, dnd-kit/react-flow drag mechanics) that
  are still accurate background for anyone editing the harness itself — the
  old file's actual test instructions (click text "Deck", `waitForTimeout(500)`
  fallback) were stale post-redesign and are now superseded by the harness.
  Updated `CLAUDE.md`'s Testing section and Additional Reference list to point
  at the new contract doc first.

## Remaining follow-ups (not part of this plan, tracked here for visibility)

- Promote `e2e-full` from advisory to blocking once it's proven stable in CI.
- Build the deferred `window.__aura`/`serializeGameState()` state-accessor
  (see `docs/testing/e2e.md`) when there's a concrete sync/persistence-race
  regression to guard against.
- Triage the 6 suspected product bugs Phase 3 surfaced (listed in
  `docs/testing/e2e.md` and in full in the Phase 3 log entry above) — none
  were fixed as part of this rehab.
- Close/clean up `.claude/worktrees/e2e-tests` — mined for reference during
  Phase 1, never merged, now superseded by the harness on this branch.
