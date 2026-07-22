Framework-agnostic primitives: generic React building blocks, shadcn `ui/`, helpers, thin
storage wrappers, and hooks with no feature dependencies.

Membership is decided by the dependency graph, not the subject matter: everything here is a
strict leaf, importing nothing from `features/` or `infrastructure/`. Anything that needs
either belongs in `app/` (if it crosses features) or in the feature itself. Adding a game
concept to something here means it has stopped being a primitive.
