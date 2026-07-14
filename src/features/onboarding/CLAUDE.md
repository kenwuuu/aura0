The first-run tour. Non-blocking coach marks: a speech bubble that sits where the action is
and waits. Steps complete because the **game state** says the player did the thing — never
because they pressed Next. The overlay takes no input at all.

`tourSteps.ts` is content. `tourProgress.ts` is completion. Everything else is plumbing.

## Change a step's copy or position

Edit `TOUR_STEPS` in `tourSteps.ts`. Copy is per-layout; the verbs genuinely differ:

```ts
play: {
  id: 'play',
  placement: 'aboveHand',   // 'aboveHand' (bubble sits over the hand, with a tail) | 'top'
  copy: {
    desktop: '**Play a card.** Drag one up onto the board.',
    phone: '**Play a card.** Long press, then drag it up onto the board.',
  },
  advance: 'action',        // 'action' = wait for the game; 'button' = wait for a click
}
```

`**bold**` is the only markup. The bubble follows the action: `play` happens in the hand, so
it sits above the hand; everything else happens on the board or the toolbar, so it gets out
of the way at the top.

## Add a step

1. Add the id to `TourStepId` (`types.ts`).
2. Add the entry to `TOUR_STEPS`.
3. Add a predicate to `COMPLETION` in `tourProgress.ts` — or `() => false` if it's
   informational and advances on its button.
4. **Add it to every order in `STEP_ORDERS`.** An order that omits it silently drops the
   step for that arm, and the experiment stops comparing like with like.

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

## Back, and why the watcher has to stand down

Going Back makes `stepIndex < furthestIndex`, which is what `isReviewing()` means. While
reviewing, `useTourProgress` does **not** auto-advance: the card the player already played is
still on the board, so `play` is still satisfied, and the watcher would fling them straight
back out of the step they just asked to re-read. Paging forward is their job until they catch
up to where they were. Re-reading a step fires no analytics — `tour_step_viewed` is a funnel
denominator, not a render count.

## Position

`useHandTop` measures the hand with a `ResizeObserver`. The hand is `position: fixed` against
the bottom edge, so its top only moves when its height does (zoom, rotation, resize) — unlike
a react-flow node, it does not move when the board pans, which is why this replaced an
earlier per-frame rAF loop that was paying for nothing.

## Tests

`onboarding_tour.spec.ts` opts in with `test.use({ onboardingTour: true })`. Every *other*
spec suppresses the tour, because a fresh browser context is a brand-new player and the tour
would otherwise render in all of them (`tests/e2e/fixtures.ts` marks the browser a returning
player by default).

The load-bearing assertions have each been checked against the bug they exist to catch — the
drag test goes red under `pointer-events: auto`, and the baseline test in `tourStore.test.ts`
goes red if `advance()` stops re-reading the counts. If you change either behaviour, re-run
that check rather than trusting the green.
