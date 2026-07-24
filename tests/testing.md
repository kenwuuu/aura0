# E2E Testing Notes

The full contract (rules, harness API, CI wiring, banned patterns) lives in
`docs/testing/e2e.md` — read that first. This file is a thin pointer plus a
couple of low-level mechanics worth knowing when you're working inside the
harness itself (`tests/e2e/harness/`), not when writing a spec.

## ⚠️ Do not write tests that import from Moxfield

**Use Archidekt for any deck-URL-import coverage.** It is uncapped, needs no
credential, and drives the identical code path, so you lose nothing.

Moxfield is different from every other deck source: it requires an approved
User-Agent that Moxfield issued to Aura, and that credential is capped at **one
request per second for the whole application** — the same budget real players
are spending right now. Breaching it does not get you a 429 to retry; it risks
the credential being revoked, which removes the feature for every player. A
Playwright run fans out across browsers and workers and would exhaust that
budget immediately.

Three things that make this easier to get wrong than it sounds:

- **`aura0` and `aura0-staging` share one rate gate**, so a test pointed at
  staging spends production's budget.
- **The gate only guards `/api/deck-import`.** Anything that calls
  `api.moxfield.com` directly — a script, a fixture generator, a quick curl —
  bypasses it entirely and is invisible to it.
- **It is genuinely easy to trip.** Six requests in a few seconds hit
  Cloudflare's 1015 limiter on the credential while this feature was being
  built.

Moxfield parsing is covered by unit tests against captured fixtures
(`src/features/deck-manager/url-import/moxfield.test.ts`). A change to how we
read Moxfield decks belongs there — no network required. See rule 9 in
`docs/testing/e2e.md`, and `src/worker/moxfieldGate.ts` for how the cap is
enforced in production.

## PileViewer internals

The pile viewer renders as a `[role="dialog"]` (`data-testid="pile-viewer"`,
`data-pile-type="<kind>"`) containing a `.deck-pile-viewer-grid` div. Each card
is `data-testid="pile-viewer-card"` `data-card-id="<id>"` (harness:
`pileViewerCards(page)` / `pileViewerCard(page, id)`); card art comes from an
inner `<img>` whose `alt` is the card name. Position labels render as text
("Top 1", "Top 2", ...).

`CardGrid.tsx` progressively renders in batches of 5 every 25ms
(`PileViewerReact.tsx`'s `visibleCardCount` state drives it) to avoid blocking
the main thread on a 92-card grid. Don't wait on a fixed timeout or "is the Nth
card visible yet" — wait on the harness's `waitForPileViewerReady(page)`
(`tests/e2e/harness/waits.ts`), which polls the grid's
`data-rendering-complete="true"` attribute, set once
`visibleCardCount >= total`.

## dnd-kit / react-flow drags

Playwright's `.dragTo()` dispatches a single native HTML5 drag-event sequence
that neither dnd-kit nor react-flow listens for — it's a no-op for both. Both
libraries need real mouse events: `mouse.move` → `mouse.down` → a small move
past dnd-kit's 8px activation threshold (`activationConstraint: { distance: 8
}` in `CardGrid.tsx`'s `mouseSensor`) → move to the target → a short pause →
`mouse.up` → another short pause for the drop/animation to settle. This is
exactly what `mouseDrag` (`tests/e2e/harness/interactions.ts`) does — use it
(or a helper built on it) rather than reimplementing the recipe.
