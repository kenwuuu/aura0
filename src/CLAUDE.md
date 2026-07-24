Source root following screaming architecture: domain verticals in `features/`, cross-cutting tech in `infrastructure/`, generic primitives in `shared/`, app shell in `app/`.
Entry point is `app/main.ts` → `bootstrapGame()` → single `createRoot(<App/>)`. Bootstrap is the only imperative layer; UI is one React tree, with no detached roots or imperative UI classes.
