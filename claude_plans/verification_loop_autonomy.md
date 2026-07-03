# Closing the Verification Loop for Autonomous Coding Agents

## Status: items 1 and 3 done (2026-07-03); items 2, 4, 5, 6, 7 not started — restart here

Done so far:
- **Item 1**: `vite.config.ts` now only includes `sentryVitePlugin` when
  `SENTRY_AUTH_TOKEN` is set in the environment. Verified `npm run build`
  with the token unset still builds cleanly (exit 0) with no upload attempt,
  and with the token present the upload still fires as before.
- **Item 3**: added a `typecheck` script (`tsc --noEmit`) to `package.json`
  and wired it into `.github/workflows/test.yml` as the first step, before
  `test:run`/`test:coverage`. Verified `npm run typecheck` passes clean.

Still open: item 2 (delete/hold the untracked `playwright.yml`), item 4 (E2E
rehab — the big one), item 5 (coverage threshold judgment call on
`infrastructure/**`), item 6 (document the two test gotchas), item 7 (a
combined `npm run verify` script).

## Context

After completing the Test Foundation → CD Confidence plan
(`claude_plans/test_foundation_progress.md`, merged to `master` via the
`test-foundation-cd` branch on 2026-07-03), we audited what's still missing
for coding agents to work on this repo without a human closing the
verification loop for them. Every item below was verified directly against
the current repo state, not assumed.

## Findings & action items (priority order)

1. **`npm run build` unconditionally uploads to production Sentry.**
   `vite.config.ts`'s `sentryVitePlugin({org: "ken-zw", project:
   "javascript-react"})` has no env guard — confirmed by actually running
   `npm run build` locally, which uploaded real source maps. Before build can
   be used as a CI/agent gate, guard the plugin (skip unless
   `SENTRY_AUTH_TOKEN` + a real release context is present, or add a
   `build:ci` script that omits the plugin). Otherwise every agent run/PR
   build spams production Sentry with WIP releases, or hard-fails wherever
   the token isn't configured.

2. **Untracked `.github/workflows/playwright.yml` is a landmine.** It runs
   `npx playwright test` on every push to `master`. The whole E2E suite is
   currently red (`tests/e2e/fixtures.ts` gates on the removed
   `#local-dock`; rehab is owned by the `worktree-e2e-tests` worktree,
   explicitly out of scope elsewhere). Delete it or keep it uncommitted until
   the rehab lands, so it doesn't break CI by accident.

3. **`tsc --noEmit` isn't gated anywhere.** Not in
   `.github/workflows/test.yml` (only `test:run` + `test:coverage` run
   there), not in the husky pre-commit (`lint-staged` only runs `vitest
   related --run`). A type error untouched by any test can merge clean
   today. Add a typecheck step to CI.

4. **E2E rehabilitation is the highest-leverage gap for autonomy
   specifically.** The three-tier test model (by design) routes all
   pointer-physics/canvas/dnd-kit/WebRTC-sync behavior to E2E — meaning an
   agent editing battlefield drag, hand reorder, or peer sync has zero
   automated feedback today; it either hands off to a human (as happened
   this session) or ships blind. This is exactly where bugs like the
   hand-disappearing race condition (see `notes.md` at the repo root) live —
   an ordering bug across IndexedDB persistence vs. WebRTC sync that no
   vitest test can ever catch. Owned by `worktree-e2e-tests`; getting even a
   small smoke suite (load → draw → play a card → open a pile) green and
   wired into CI is probably the single biggest step toward real autonomy.

5. **Coverage thresholds only cover 4 directories.**
   `src/infrastructure/{cards,persistence,networking}` sit at roughly 6–10%
   today. This is exactly the kind of low-level plumbing an agent is likely
   to touch confidently and break quietly, with CI staying green regardless.
   Needs a deliberate decision, not urgent: add narrow logic tests for the
   highest-risk pieces (e.g. `CardLookupService`'s Aura→Scryfall fallback),
   or explicitly document why the rest stays excluded (I/O boundary, per the
   original plan's own stated philosophy), so it isn't re-litigated every
   time someone notices the number.

6. **Two non-obvious test gotchas from the last session aren't documented
   anywhere.** Unlike the dnd-kit `.dragTo()` gotcha (already captured in
   `tests/testing.md`), these two are missing from `tests/testing-react.md`:
   - vitest module mocking: `vi.mock('concrete/path')` can silently no-op if
     a globally-loaded `setupFiles` entry (or anything it transitively
     imports) already cached that module via a barrel re-export before the
     test file's own hoisted `vi.mock` registers. Fix: mock the barrel path
     the component actually imports from, not the concrete submodule path.
   - Radix `Slider`'s `role="slider"` lives on the `Thumb` subcomponent, not
     `Root` — an `aria-label` passed to `<Slider>` and forwarded to Root is
     invisible to accessible-name computation; it must be threaded
     explicitly onto `Thumb`.
   Both produce a quiet false-green rather than a loud failure, which is the
   worst case for an agent trusting its own verification step.

7. **A single `npm run verify` script** (tsc + test:coverage, plus build
   once item 1 is fixed) would give an autonomous agent one command to trust
   instead of needing to already know to chain several separate ones. Low
   effort, direct payoff for closing the loop.

## Suggested order

Items 1 and 3 are ~5 minutes each and unblock item 7. Item 2 is a one-line
deletion. Item 6 is pure documentation. Item 4 is the real project — it
should get its own planning pass when picked up, and probably folds into
whatever `worktree-e2e-tests` is already doing. Item 5 is a one-time
judgment call, not urgent.

## Out of scope / explicitly not part of this plan

- Actually rehabilitating E2E — owned by `worktree-e2e-tests`. This plan
  just argues for prioritizing it.
- Any ESLint/linting setup — confirmed there is no ESLint in this repo at
  all today (no config, no dependency, no script). That's a separate
  decision, not assumed here.
