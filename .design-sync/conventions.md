# Aura Components — Manabase design system

HUD-inspired, **dark-only** UI for a peer-to-peer Magic: The Gathering tabletop:
hairline borders, translucent panels, purple energy, glow-as-elevation, and
monospace tabular numbers. These are the app's real shipped `shared/ui`
primitives (shadcn + Radix under the hood) plus two HUD parts.

## Setup — no provider, but render dark

Components are styled the moment `styles.css` is loaded — **no theme provider or
root wrapper is required.** The system is **dark-only**: there is no light theme,
so always build on the near-black app surface. `styles.css`'s closure already
sets `body { background: var(--background); color: var(--foreground); font-family: var(--font-sans) }`,
so a default page is correctly dark — a component placed on a **white** surface
will look broken (transparent `secondary`/`ghost` controls disappear).

Two exceptions:
- **Tooltip** must be wrapped in `<TooltipProvider>` (once, high in the tree).
- **Toaster** is mounted **once** near the root; fire toasts imperatively with
  `toast()` / `toast.success()` / `toast.error()` (both are exported).

## Styling idiom — tokens first

Style with the design tokens, never raw hex (the whole palette is dark-tuned).
Tokens are CSS variables, always available from the loaded stylesheet:

| Token | Use |
|---|---|
| `--bg` `--bg-2` | page / panel backgrounds (near-black) |
| `--surface` `--surface-2` | translucent raised fills (hairline, not solid) |
| `--line` `--line-2` | hairline borders |
| `--text` `--text-dim` `--text-mute` | primary / secondary / tertiary text |
| `--primary` `--accent` | brand purple (fills, focus, active) |
| `--accent-2` `--accent-pink` | rare deliberate accents (blue / pink) — data, not chrome |
| `--good` `--danger` `--warn` | status |
| `--glow` `--glow-strong` | **elevation = glow, not shadow** on focus/active |
| `--shadow-sheet` | real shadow — reserved for things that leave the plane (menus, dialogs, panels) |
| `--font-sans` (Space Grotesk) `--font-mono` (Space Mono) | text / **tabular numbers** |

**Radius is sharp, not soft** — use the shipped utilities `rounded-sm` (2px),
`rounded-md` (4px, the default), `rounded-lg` (6px). (Radius has no `var(--radius-*)`
token — the values are inlined into these utilities.)

A **subset** of tokens is also exposed as Tailwind utilities that ship in the
CSS: `bg-primary` `text-primary-foreground` `bg-surface` `bg-card`
`border-line-2` `border-border` `text-foreground` `text-muted-foreground`
`rounded-sm|md|lg`. For any token without a ready-made utility (e.g. `--text-dim`,
`--danger`, `--accent-2`), use the variable directly: `style={{ color: 'var(--text-dim)' }}`
or an arbitrary utility like `text-[var(--danger)]`.

Rules that keep designs on-brand:
- **Hairline over fill** — if a border will do, don't add a background.
- **Elevation = glow** (`--glow`), not drop-shadow, except floating sheets.
- **Numbers are mono + tabular** — every game count (life, deck, mana) uses
  `font-family: var(--font-mono); font-variant-numeric: tabular-nums`.
- **Purple is the only brand energy.** `--accent-2` / `--accent-pink` are rare.
- Note: Tailwind's `bg-accent` is the *hover wash* (mapped to `--accent-soft`),
  while `bg-primary` / `text-primary` are solid brand purple.

## Where the truth lives

- `styles.css` and its `@import` closure (`_ds_bundle.css`) — every token and
  component style. Read it before styling.
- `guidelines/docs/styling.md` — the full styling contract (three tiers, no-hex
  rule, radius/motion/mana-color rules).
- Each component's `<Name>.d.ts` (API) and `<Name>.prompt.md` (usage + example).

## Idiomatic example

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
         DialogFooter, DialogClose, Button } from '<lib>';

<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Start a New Game?</DialogTitle>
      <DialogDescription>This opens a new room with a different room ID.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
      <Button variant="destructive">New Game</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Compound components (Dialog, Select, DropdownMenu, Popover, Tooltip, Alert,
ScrollArea) expose their parts as sibling exports (`DialogContent`,
`SelectItem`, `DropdownMenuItem`, …) — compose them, don't reinvent.
