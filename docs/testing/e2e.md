# E2E Testing Contract

Playwright tests live under `tests/e2e/`. The goal: the easiest test to write
is also the correct one. That means going through the harness, not raw
Playwright locators — an agent (or a person) writing a new E2E test should
never need to invent a selector or a drag recipe from scratch.

## The rules

1. **Never `waitForTimeout` for app state.** If you're tempted to add a fixed
   sleep, there's a real condition you're actually waiting for — express it as
   a semantic wait instead (see `tests/e2e/harness/waits.ts`) or a Playwright
   `expect(...).toHaveCount/toHaveAttribute/toBeVisible` poll. The one
   sanctioned exception is inside `mouseDrag` itself, where the delays are
   part of the drag gesture (dnd-kit/react-flow need a pause between the
   pointer-down nudge and the release to register the drop), not a wait for
   app state.
2. **Interact through the harness, not raw locators.** Import from
   `tests/e2e/harness` (barrel-exported via `index.ts`): page objects
   (`boardCard`, `pileTile`, `handCard`, `healthInput`, `pileViewer`, ...),
   interactions (`playHandCardToBoard`, `dragBoardCardToPile`, `importDeck`,
   ...), and domain assertions (`expectPileCount`, `expectHandCount`,
   `expectHealth`, ...). If the interaction you need doesn't exist yet, add it
   to the harness rather than reaching for `page.locator(...)` inline — the
   next test gets it for free.
3. **Use stable testids, not text/position.** Every surface a test needs to
   target should carry a `data-testid` (see the table in Phase 0 of
   `claude_plans/e2e_harness_progress.md` for the current inventory: battlefield
   card/token, pile, health input, hand card, pile-viewer modal/card,
   deck-import trigger/modal). Positional selectors
   (`div.filter({hasText:'#'}).nth(N)`) and concatenated-text selectors
   (`getByText('Deck92Draw')`, which only works because sibling `.pile-label`/
   `.pile-count` text nodes happen to concatenate) are both banned — they
   break silently on unrelated layout changes. Legitimate single-text-node UI
   copy (context-menu item labels like `'SExile'`, dialog titles, button
   names) is fine to match by text/role; that's not the same failure mode.
4. **`.dragTo()` is banned** except for genuinely native-HTML5-`draggable`
   elements (currently only the token-drawer templates, via
   `dragCountedTokenToBoard`). It doesn't drive dnd-kit or react-flow node
   drags — both need real mouse events past dnd-kit's 8px activation
   threshold. Use `mouseDrag` (or a helper built on it) instead.
5. **One behavior per test.** A test should exercise and assert one thing.
   Setup/preamble (importing a deck, playing a card onto the board) belongs in
   a scenario helper (`tests/e2e/harness/scenarios.ts`) so it reads as a single
   line, not a re-litigation of a previous test.
6. **DOM assertions are the default; state assertions are a deferred,
   targeted supplement.** This app's DOM is largely *the* product (a
   whiteboard), so DOM-based assertions (does the card render on the board?
   does the pile count read 3?) are the right default and cover almost
   everything. The one class of bug DOM assertions can't reliably catch is a
   sync/persistence *race* — e.g. a fresh local re-init briefly writing an
   empty hand before remote/IndexedDB data arrives (see `notes.md`) — where
   the DOM can look correct one tick and wrong the next, or vice versa. That
   needs reading the actual Yjs state, not polling the DOM. This accessor
   doesn't exist yet; see "Deferred: state-based assertions" below before
   building one — don't invent an ad hoc one in a single spec.
7. **`@smoke` tests are the blocking gate — keep that suite small and
   real-transport.** Tag with Playwright's tag syntax:
   `test('...', { tag: '@smoke' }, async ({ page }) => { ... })`. A test only
   belongs in `tests/e2e/smoke/` if it exercises a load-bearing subsystem once
   (board render, drag-and-drop, pile viewer batch-render, real multiplayer
   sync) — see the existing 5 for the bar. Everything else belongs in
   `tests/e2e/app/` as advisory (untagged) coverage. Don't tag a test `@smoke`
   just because it passes reliably; tag it because its failure should block
   merges.

## Directory layout

- `tests/e2e/fixtures.ts` — the shared `test`/`expect` export. The `page`
  fixture navigates to a fresh room, clears `localStorage`, closes any
  first-load modals, blocks PostHog (see below), and waits for the default
  deck to be fully loaded (40 health, 8-card hand) before handing the page to
  the test. Every spec imports `test`/`expect` from here, not
  `@playwright/test` directly.
- `tests/e2e/harness/` — the test-only API surface. `selectors.ts` (testid
  constants — the only place a raw `data-testid` string should appear),
  `pageObjects.ts` (locators), `interactions.ts` (`mouseDrag` and everything
  built on it, plus `importDeck`/`drawCard`/`openPileViewer`), `waits.ts`
  (`waitForPileViewerReady`, `waitForSync`), `assertions.ts` (domain-level
  `expect` wrappers), `scenarios.ts` (multi-step setup: `importOneCardDeck`,
  `drawOpeningHand`, `playCreature`, `moveBetweenZones`, `reloadAndResync`,
  `connectSecondPlayer`), `network.ts` (`blockAnalytics`). All re-exported
  from `index.ts` — import from `'../harness'` (or `'../../harness'` from a
  nested spec directory), not individual files.
- `tests/e2e/smoke/` — the blocking `@smoke` tier.
- `tests/e2e/app/` — the advisory (non-blocking) tier: broader behavior
  coverage, rehabbed onto the harness but not required to be flake-free
  before merging.

## Why PostHog is blocked in tests

`tests/e2e/harness/network.ts`'s `blockAnalytics()` aborts all requests to
PostHog. Two reasons: it keeps automated runs from firing real analytics
events into production, and — more importantly — it forces
`resolveNetworkTransport()` (`src/infrastructure/analytics/FeatureFlags.ts`)
through its 1.5s timeout fallback (`webrtc`) instead of racing a live
experiment flag that can currently route a session to a broken `websocket`
relay. This was a real, reproduced source of E2E flakiness, not theoretical —
see the Phase 1 log entry in `claude_plans/e2e_harness_progress.md`. Every
page a test creates (including a second `connectSecondPlayer` context) must
call `blockAnalytics(page)` before its first `goto()`.

## CI

- `e2e-smoke` job: blocking, runs `npm run test:e2e:smoke`.
- `e2e-full` job: advisory (`continue-on-error: true`), runs `npm run test:e2e`.
- Both scripts are pinned to `--project=chromium` — firefox/webkit are
  configured in `playwright.config.ts` but have never been exercised against
  this harness (mouse-event drags, `elementFromPoint` hit-testing, react-flow
  specifics are all chromium-verified only). Run `npx playwright test
  --project=firefox` (or `webkit`) manually if you need to check cross-browser
  behavior; don't assume CI covers it.
- Promote `e2e-full` to blocking once it's been stable in CI for a while —
  don't promote a suite still finding its flake rate.

## Deferred: state-based assertions

Not built yet. When picked up: add a dev/test-gated accessor in
`src/app/bootstrap.ts` (after the store is populated) —
`window.__aura = () => useGameInstance.getState()`, gated on the existing
`import.meta.env.MODE === 'development'` idiom (true under Playwright's
`npm run dev`). Add a `serializeGameState()` that walks the top-level Yjs maps
(`YDOC_CARDS_ON_BOARD`, `YDOC_KEYWORD_TOKENS`, `YDOC_ACTION_LOG`) plus each
player's `YDOC_PLAYER(id)` map into a structured-clonable snapshot. Then add a
`game.state()` harness helper and 1-2 assertions targeting the
persistence/sync-race class specifically (the `reloadAndResync` scenario is
built for this). This is deliberately not bundled into the harness build —
it's the one piece that adds test-only surface to the product bundle and
carries its own false-green risk if the snapshot drifts from the real schema,
so it deserves its own pass rather than being squeezed into this round.

## Known product bugs surfaced by this suite (not fixed here, see skip sites)

Phase 3 of the harness rehab found six suspected real product bugs while
rewriting the advisory suite — each is `test.skip`'d at its exact reproduction
site in `tests/e2e/app/` rather than fixed (out of scope for a test rehab).
Full detail is in the Phase 3 log entry of
`claude_plans/e2e_harness_progress.md`: the toolbar's Token popover never
opens, the "-1/-1 counter" menu action is an unimplemented no-op, clicking
"To deck top" in the Scry viewer over-credits the deck by 10x, clicking "To
deck top"/"To deck bottom" from a pile viewer closes it before a second
sequential action can run, deck-viewer "To deck top/bottom" menu rows never
render (a `hotkeys.ts` context-array omission), and toggling "Reveal Hand" off
closes the Actions dropdown before the click lands.
