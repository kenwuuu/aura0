The first-run tour. Non-blocking coach marks: a speech bubble that sits where the action is
and waits. Steps complete because the **game state** says the player did the thing — never
because they pressed Next. The overlay takes no input at all.

`tourSteps.ts` is content. `tourProgress.ts` is completion. Everything else is plumbing.

## Change a step's copy or position

Edit `TOUR_STEPS` in `tourSteps.ts`. Copy is per-layout; the verbs genuinely differ:

```ts
play: {
  id: 'play',
  placement: 'aboveHand',   // 'aboveHand' | 'belowAnchor' (needs `anchor`) | 'top'
  copy: {
    desktop: '**Play a card.** Drag one up onto the board.',
    phone: '**Play a card.** Long press, then drag it up onto the board.',
  },
  advance: 'action',        // 'action' = wait for the game; 'button' = wait for a click
}
```

`**bold**` is the only markup.

The shipping tour is four steps: **play, tap, draw, invite**. The three hand/board steps all
park the bubble in the same place, above the hand — moving it between them made the tour feel
like it was chasing the player around, so only the words change. `invite` is the one step
about a *specific control*, so it's the only one that leaves: it drops under the room-link
button (`belowAnchor` + `anchor`) with the tail pointing up at it, and `halo: true` rings the
button. A halo on a hand card only competed with the card art, which is why the hand steps
point with the tail instead.

The bubble is clamped inside the viewport, so the tail slides along its edge
(`--tour-tail-left`) to keep pointing at an anchor that sits off toward a corner.

## Add a step

1. Add the id to `TourStepId` (`types.ts`).
2. Add the entry to `TOUR_STEPS`.
3. Add a predicate to `COMPLETION` in `tourProgress.ts` — or `() => false` if it's
   informational and advances on its button.
4. **Add it to every order in `STEP_ORDERS`.** An order that omits it silently drops the
   step for that arm, and the experiment stops comparing like with like. (`history` is absent
   from *all* of them — that's what "disabled" means, and it's the one legitimate way for a
   step to be missing. Put its id back into the orders to re-enable it.)

## Run an A/B

Add a key to `STEP_ORDERS`, add the matching variant to the `onboarding-tour-step-order`
PostHog flag, add it to `TourVariant` and to the check in `resolveTourStepOrder()`
(`FeatureFlags.ts`). Every tour event already carries `variant`, so the funnel splits
itself. An unrecognized variant falls back to `control` rather than producing a tour with
no steps.

## The four things that will bite you

**Never give the overlay `pointer-events: auto`.** The `play` step is a drag that *starts in
the hand and ends on the board* — two disjoint regions. Anything pointer-capturing between
them eats the drop, and the tour deadlocks on a step the player is physically unable to
complete. This is also why the bubble is a plain fixed div and not a Radix Popover: Radix's
dismiss layer and focus trap exist to make the rest of the page inert, which is the exact
opposite of what a coaching overlay wants. Only the buttons opt back in.

**A step is measured against the game as it was when *that step* appeared** — not when the
tour started (`StepBaseline`, re-read on every transition). This is not a nicety. `draw`
completes when the hand grows; in the `control` order the player has already put a card
down, so the hand is at 7 by the time the draw step appears. Measured against the 8 they
opened the tour with, drawing back up to 8 isn't growth, and the step silently demanded two
draws. `tourStore.test.ts` pins this.

**Copy has to name a gesture that exists.** There is no left-click-to-tap: tapping a board
card is the Space hotkey (routed by `hoverTarget`) or the context menu — and a board card is
`menuFirst`, so on touch a single tap opens that menu with no preview first. The copy said
"click the card" for a while, which does nothing whatsoever. Check the real handler before
writing an instruction.

**Predicates describe state, not the route to it.** `myBoardCards.length > baseline`, never
"the hand-drag handler fired". Playing a card by drag, by hotkey, or from a pile all land in
the same `yCards` map, so a new play-path satisfies `play` for free — the same reasoning as
"complete semantic actions" in the root CLAUDE.md. A predicate that hooks one call site is a
bug waiting for the second one.

**But a predicate for "the player did X" must not be satisfiable by *other people*.** `invite`
used to also complete on `playerCount > 1`, on the theory that a peer arriving meant the
player had clearly invited someone. It fires for a duplicate tab, for a socket that hasn't
finished closing after a reload, and — worst — for simply *being the friend who was invited*:
you join an existing room at 2 players, so `invite` completed the instant it appeared. Being
the last step, that ended the whole tour and marked it done. The step was never seen; the tour
just vanished after the draw. Pinned by `tourProgress.test.ts` and by "the invite step survives
another player being in the room" in the e2e.

## Back, and why the watcher has to stand down

Going Back makes `stepIndex < furthestIndex`, which is what `isReviewing()` means. While
reviewing, `useTourProgress` does **not** auto-advance: the card the player already played is
still on the board, so `play` is still satisfied, and the watcher would fling them straight
back out of the step they just asked to re-read. Paging forward is their job until they catch
up to where they were. Re-reading a step fires no analytics — `tour_step_viewed` is a funnel
denominator, not a render count.

## Position

`useElementRect` measures anchors with a `ResizeObserver`. Everything the tour points at — the
hand, the toolbar's room-link button — is `position: fixed` against a screen edge, so it moves
only when it *resizes* (zoom, rotation, window resize). A react-flow node would need per-frame
measurement, because the board's CSS transform moves it without firing anything; nothing the
tour points at lives in there, which is why an earlier rAF loop was paying for nothing.

Anchor the hand steps to the hand *cards*, not their container — the container carries ~20px
of padding above them, and anchoring to it left the tail pointing at empty space.

## Tests

`onboarding_tour.spec.ts` opts in with `test.use({ onboardingTour: true })`. Every *other*
spec suppresses the tour, because a fresh browser context is a brand-new player and the tour
would otherwise render in all of them (`tests/e2e/fixtures.ts` marks the browser a returning
player by default).

The load-bearing assertions have each been checked against the bug they exist to catch — the
drag test goes red under `pointer-events: auto`, and the baseline test in `tourStore.test.ts`
goes red if `advance()` stops re-reading the counts. If you change either behaviour, re-run
that check rather than trusting the green.
