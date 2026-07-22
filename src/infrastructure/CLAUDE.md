The I/O and platform layer: card lookup, networking/sync, persistence, analytics. Anything that
talks to the outside world and isn't specific to one feature. Code here knows *how* to fetch,
sync, or persist — never the rules of the game.

Features call in, not the reverse. The domain model is the one thing that crosses back:
`Card`, `DeckLineItem`, and friends are imported from `features/player` and
`features/deck-manager` by design. A feature's stores, components, or behavior are not —
nothing here imports those today, and needing to means the dependency belongs elsewhere,
usually as a callback the feature passes in.
