The first-run tour. Non-blocking coach marks: a ring around the thing to touch, a card
saying what to do with it. Steps complete because the **game state** says the player did
the thing — never because they pressed Next. The overlay never takes input.

`tourSteps.ts` is content. `tourProgress.ts` is completion. Everything else is plumbing.

## Change a step's copy or anchor

Edit `TOUR_STEPS` in `tourSteps.ts`. Copy and anchor are both per-layout:

```ts
play: {
  id: 'play',
  anchor: { desktop: '[data-testid="hand-card"]', phone: '[data-testid="hand-card"]' },
  copy: {
    desktop: '**Play a card.** Drag it to the board.',
    phone: '**Play a card.** Long press, then drag it to the board.',
  },
  advance: 'action',   // 'action' = wait for the game; 'button' = wait for a click
}
```

`anchor: null` renders the card with no ring (used by `draw`, whose target is the whole
board). `**bold**` is the only markup.

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

## The three things that will bite you

**Never give the overlay `pointer-events: auto`.** The `play` step is a drag that *starts in
the hand and ends on the board* — two disjoint regions. Anything pointer-capturing between
them eats the drop, and the tour deadlocks on a step the player is physically unable to
complete. This is also why the coach mark is a plain fixed div and not a Radix Popover:
Radix's dismiss layer and focus trap exist to make the rest of the page inert, which is the
exact opposite of what a coaching overlay wants. Only the Skip/Got-it buttons opt back in.

**Never gate the tour behind `hotkeyStore.setModalOpen(true)`.** It disables the board
hotkey scope, which stops the player doing the very thing the current step is asking for.
(That call is correct for a *blocking* overlay. This isn't one.)

**Predicates describe state, not the route to it.** `myBoardCards.length > 0`, never "the
hand-drag handler fired". Playing a card by drag, by hotkey, or from a pile all land in the
same `yCards` map, so a new play-path satisfies `play` for free — the same reasoning as
"complete semantic actions" in the root CLAUDE.md. A predicate that hooks one call site is
a bug waiting for the second one.

## Anchors and the moving board

`useAnchorRect` re-measures on a rAF loop while the tour is up, rather than on
resize/scroll. Board cards and piles are react-flow nodes inside `.react-flow__viewport`, a
CSS-transformed container that fires **no scroll event** when it pans or zooms — anything
event-driven goes stale the moment the player moves the board. The loop only re-renders
when the rect actually changes.

Anchors are the same `data-testid`s the e2e harness uses (`tests/e2e/harness/selectors.ts`),
so a step and a test point at the same element by construction.
