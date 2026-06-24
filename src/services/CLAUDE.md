Residual non-feature services that haven't migrated yet: `announcements/`, `eventHandlers/` (whiteboard drop handlers), `patchNotes/`.
New cross-cutting code should land in `infrastructure/`; new feature code in `features/`. Treat this directory as legacy to drain.
