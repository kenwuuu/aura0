# E2E Testing Notes

The full contract (rules, harness API, CI wiring, banned patterns) lives in
`docs/testing/e2e.md` — read that first. This file is a thin pointer plus a
couple of low-level mechanics worth knowing when you're working inside the
harness itself (`tests/e2e/harness/`), not when writing a spec.

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
