Framework-agnostic primitives: `components/` (generic React building blocks), `ui/` (shadcn), `utils/` (helpers), `services/` (thin localStorage wrappers with no feature deps).
Must not depend on `features/` or `infrastructure/` — strictly leaves of the dependency graph.
