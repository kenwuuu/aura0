Domain verticals — `battlefield`, `card-preview`, `deck-manager`, `game-dock`, `hotkeys`, `keyword-tokens`, `opponents`, `player`, `room`. Each owns its UI plus business logic for that slice.
Reach out to `infrastructure/` for I/O (cards lookup, networking, persistence, analytics) and to `shared/` for primitives; cross-feature wiring lives in `src/index.ts` or `services/eventHandlers/`.
