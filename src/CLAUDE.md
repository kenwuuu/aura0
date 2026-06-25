Source root following screaming architecture: domain verticals in `features/`, cross-cutting tech in `infrastructure/`, generic primitives in `shared/`, app shell in `app/`.
Entry point is `app/main.ts` → `bootstrapGame()` → single `createRoot(<App/>)`. `GameResourcesDock` (in `features/game-dock/`) is the last imperative class; everything else is React.
