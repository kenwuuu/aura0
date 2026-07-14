# Manabase Design System — gallery source

Self-contained HTML preview cards for the **claude.ai/design** "Manabase Design
System" project. Each card's first line is a `<!-- @dsCard group="…" -->`
marker — the Design System pane indexes cards from it automatically.

- Cards consume `./tokens.css`, which is a **synced copy of `src/tokens.css`**
  (the single source of truth — never edit the copy; re-copy on token changes:
  `cp src/tokens.css design-system/tokens.css`).
- The implemented app is authoritative. These cards *document* the system;
  when a component changes in `src/`, update its card and re-sync.
- Push via the /design-sync flow (list → finalize_plan → write_files) to the
  "Manabase Design System" project. Design exploration for future cycles
  (motion layer, cosmetics, mobile pile viewer) happens there, against these
  cards, and gets pulled back into code.

Spec provenance: `design_handoff_manabase/` (brief + 0.2.1v living reference).
