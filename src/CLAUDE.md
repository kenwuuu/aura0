Source root. The app is mid-migration to screaming architecture: domain verticals in `features/`, cross-cutting tech in `infrastructure/`, generic primitives in `shared/`, with residual code still in `services/`, `components/`, and `utils/`.
Entry point is `src/index.ts` (wires `Y.Doc`, networking, Player, board, dock); top-level React shell is `src/App.tsx`.
