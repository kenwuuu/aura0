# Handoff: Manabase — MTG Play Interface Design System

## Overview
Manabase is a web-based play interface for Magic: The Gathering. The visual system is
**modern, sleek, fast, and HUD-inspired** — thin lines, tabular data, purple energy —
built so the UI recedes and the card art performs, and lights up only when it matters.
Motion is a first-class citizen.

This bundle contains the design system reference and its written brief. Your job is to
implement this system inside the existing codebase.

## About the Design Files
The files in this bundle are **design references authored in HTML** — a live, interactive
prototype demonstrating the intended look, feel, and motion. They are **not production
code to copy directly**.

- `Manabase Design System 0.2v.dc.html` — the living, interactive reference (latest).
- `DESIGN_SYSTEM.md` — the written brief: the *why* behind the system.

The `.dc.html` file is authored in a proprietary "Design Component" format with a custom
runtime (`support.js`) and inline-styled markup. **Do not port the DC format, its runtime,
or its inline-style approach into the app.** Read it to extract intent (tokens, layouts,
component anatomy, motion specs), then rebuild each piece using the target codebase's own
framework and conventions.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and motion timings are final and
intentional. Recreate the UI faithfully — match the exact token values below. Where the
prototype uses placeholder card art (striped SVG), substitute real card imagery.

---

## Recommended Implementation Architecture

The single most important architectural decision for a design *system* is
**single-source-of-truth design tokens**.

### Tokens — centralized
Put every primitive value in ONE place — a `:root` custom-property block (`tokens.css`) or
a typed tokens module the build consumes. All the values are listed under **Design Tokens**
below. The prototype already models this correctly: it defines everything as CSS custom
properties on a root element (`--bg`, `--accent`, `--glow`, …) and every component reads
the variables rather than hard-coding hex. **Preserve that discipline** — new surfaces
reference variables, never literals.

Note the accent + glow are *themeable knobs*: `--glow` / `--glow-strong` are derived from
`--accent` at runtime (see the `applyTheme()` / `hexToRgba()` logic in the prototype). Model
this as a small function that, given an accent hex and a glow multiplier, sets the derived
glow variables. This is dark-mode only — **do not build a light theme.**

### Component styles — modular
Style each component in its own scoped unit using **whatever the existing codebase already
uses** — CSS Modules, styled-components, Tailwind (map these tokens into
`tailwind.config`), Vue SFC `<style scoped>`, etc. Each component consumes the central
tokens; none redefine primitives locally.

**Do NOT** create one monolithic global `style.css` holding every component rule — it
becomes an unmaintainable dumping ground as the app grows. **Do** keep tokens global and
component styling local.

If the repo already has an established styling convention, follow it and tell your
implementer *"match the existing styling approach in this repo; only the tokens are
prescribed."* Don't introduce a competing pattern.

---

## Design Tokens

### Color — Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg` | `#08080c` | Base background (near-black, cool) |
| `--bg-2` | `#0d0d14` | Raised panels |
| `--surface` | `rgba(255,255,255,0.03)` | Translucent surface |
| `--surface-2` | `rgba(255,255,255,0.055)` | Translucent surface, raised |
| `--line` | `rgba(255,255,255,0.08)` | Hairline border (rest) |
| `--line-2` | `rgba(255,255,255,0.14)` | Hairline border (stronger) |

### Color — Text
| Token | Value | Use |
|---|---|---|
| `--text` | `#ECECF2` | Primary text |
| `--text-dim` | `#9A9AAB` | Secondary text |
| `--text-mute` | `#5E5E6C` | Tertiary / labels |

### Color — Brand (purple is the ONLY brand energy; blue/pink rare)
| Token | Value | Use |
|---|---|---|
| `--accent` | `#9B5CFF` | Primary brand purple — everywhere |
| `--accent-2` | `#6E7BFF` | Secondary blue — rare |
| `--accent-pink` | `#FF5CAD` | Pink — sparingly |
| `--accent-soft` | `rgba(155,92,255,0.14)` | Purple wash (active menu rows, selection) |
| `--accent-line` | `rgba(155,92,255,0.45)` | Purple hairline / focus ring |

### Color — Derived glow (from accent; elevation = light, not shadow)
| Token | Value | Use |
|---|---|---|
| `--glow` | `rgba(155,92,255,0.5)` × glow multiplier | Soft glow (focus) |
| `--glow-strong` | `rgba(155,92,255,0.85)` × glow multiplier | Full-bloom glow (active) |

### Color — State
| Token | Value | Use |
|---|---|---|
| `--good` | `#39D98A` | Gain, connected, positive |
| `--danger` | `#FF5C7A` | Damage, loss, destroy |
| `--warn` | `#FFC46B` | Warning, priority, timer |

### Color — Mana identity (DATA ONLY — pips, filters, log tags; never chrome)
| Symbol | Value |
|---|---|
| W (White) | `#EFE9CE` |
| U (Blue) | `#4A90E2` |
| B (Black) | `#3B3B44` |
| R (Red) | `#E5484D` |
| G (Green) | `#3AA76D` |

> Guardrail: never use mana colors for buttons or panels — it breaks the HUD calm.

### Typography
- **Display / UI:** `Space Grotesk`, weights 300–600. Fallback `system-ui, sans-serif`.
- **Numbers / labels / HUD data:** `Space Mono`, weights 400/700. Labels are UPPERCASE with letter-spacing.
- All game counts (life, deck, discard, exile) use Space Mono with `font-variant-numeric: tabular-nums` so digits never shift.

Type scale (from the prototype):
| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Cover H1 | Grotesk | 68px | 600 | -0.045em |
| Display | Grotesk | 52px | 600 | -0.04em |
| H1 | Grotesk | 34px | 600 | -0.03em |
| H2 / section | Grotesk | 24px | 500 | -0.02em |
| Body | Grotesk | 16–17px | 300 | — (line-height 1.55) |
| Label / mono | Space Mono | 10–12px | 400 | 1–2px, uppercase |
| Big number | Space Mono | 40–64px | 700 | -0.02em, tabular |

### Radius — base 4px, sharp not soft
- `2px` inner chips
- `4px` controls & panels (default)
- `6px` medium containers
- `8px` large containers only

### Spacing — 4px grid, compact pro-tool density
`4 / 8 / 12 / 16 / 24 / 32`

### Motion
| Token | Value |
|---|---|
| Micro-interactions | 120–180ms |
| Standard ease | `cubic-bezier(.2,.7,.2,1)` |
| Big "moments" (cast/kill/win) | 400–700ms |

> Principle: calm at rest, dramatic on events. Don't spend a "moment" on something routine.

### Elevation
Depth reads as **glow**, not shadow. Rest = 1px hairline. Focus = soft glow (`--glow`).
Active = full bloom (`--glow-strong`). Shadow is reserved for surfaces that genuinely
leave the plane (floating menus / dropdowns): e.g. `0 12px 40px rgba(0,0,0,.5)`.

---

## Components (in the reference, section-numbered)

### 01 · Buttons
Variants — one action per view for Primary:
- **Primary** — filled `--accent`, dark text `#0a0410`, `box-shadow: 0 0 0 1px var(--accent-line), 0 0 18px var(--glow)`. Hover: `translateY(-2px)`, stronger glow.
- **Secondary** — `--surface` fill, `--line-2` border. Hover: accent border + glow.
- **Ghost** — transparent, `--text-dim`. Hover: `--surface` bg, `--text`, `--line` border. Toolbar / low emphasis.
- **Destroy** — transparent, `--danger` text, `rgba(255,92,122,.35)` border. Hover: faint danger wash. Irreversible actions only.
- **Icon** — square, `--surface`, `--line-2` border. Hover: accent border + glow.
- **Disabled** — `--surface`, `--text-mute`, opacity .5, `cursor: not-allowed`.

Common metrics: radius 4px, padding ~11px 20px, Grotesk 14px / weight 500–600, transition `.16s`.

### 02 · Top toolbar
Raised bar (`--bg-2`) with a hairline bottom border and `linear-gradient(180deg, var(--surface), transparent)` top wash. Left cluster: primary "Choose Deck" + ghost links + a Discord button (uses `--accent-2`). Right cluster: a "Connected" status pip (`--good`, blinking dot, mono uppercase) + "Copy Link" ghost/mono button. A second row of small (12px) secondary buttons: Untap All / Draw / Pass / Actions ▾ / Create ▾.

### 03 · Player panel
280px panel with a signature **animated clockwise conic-gradient border trace** (spins 3.4s linear, purple→blue→white sweep) around a `--bg-2` inner card. Contains: player name (mono uppercase) + "YOU" tag, a 64px tabular life number with text-glow, a thin gradient life bar, and −/+ life steppers (hover: danger/good tint + glow). **On life change, the number flashes and scales** (`playTick` — scale 1.22 + color tint, 380ms).

### 04 · Zone counters (Deck / Discard / Exile)
Small `--bg-2` cards. **Deck** is the active zone: accent border + `--glow` box-shadow, a **rotary odometer reel** for the count (two vertical digit strips that `translateY` with `.55s cubic-bezier(.2,.8,.2,1)` — drawing rolls a digit up from below), a return (↺) button, and a full-width primary "Draw" button. **Discard / Exile** are quiet: `--line` border, muted mono count, dashed drop zone.

### 05 · Menus (dropdown)
Floats on `--bg-2` with `--line-2` hairline outline + deep shadow (the one place shadow is allowed — sheet leaves the plane). Active row: **2px `--accent` left rail + faint `--accent-soft` wash**, never a full fill. Destructive rows use `--danger` text. Divider = 1px `--line`.

### 06 · Card states (interactive)
Card ~156×218, radius 4px.
- **Rest** — bare 1px `--line-2` frame + soft drop shadow.
- **Hover** — `translateY(-10px)`, accent border, big shadow + `0 0 32px var(--glow)` bloom.
- **Tapped** — `rotate(20deg)`, no glow, opacity .85 (spent, quiet).
- **Targeted** — accent border + continuous `pulseGlow` aura (1.2s loop).
All transitions spring-eased, under 200ms.

### 07 · Motion primitives
- **Priority pulse** — `pulseGlow` loops on whoever holds priority (1.6s, breathing).
- **Target reticle** — rotating 1.5px dashed accent ring (`spinReticle`, 6s linear) while choosing a target.
- **Big moment** — radial burst, reserved for kills/combos/wins (one-shot 650ms). Earn it.

### 08 · Dependency links (equip / enchant)
Animated SVG filaments between two cards, drawn on a curved `<path>` with a traveling glowing dot (`<animateMotion>`) and `stroke-dashoffset` flow:
- **Equip** — `--warn` colored, solid-ish `stroke-dasharray: 5 5`, mechanical/directional (energy flows toward the creature).
- **Enchant / aura** — `--accent-2` colored, lighter `stroke-dasharray: 2 5` dotted, magical; a second white sparkle dot trails. Color keys to the aura's identity.

### 09 · Board & spellcast ripple (SUBSCRIBER — feature-flag)
Dot-grid board (`radial-gradient` dots on `--bg-2`, 22px grid, vignette overlay). Casting a
card animates it dropping onto the board with expanding ripple rings. **Ripple size ∝ mana
cost; hue ∝ card color.** See `spawnAt(x, y, cost, color)` in the prototype for exact
timing (card drop 950ms, rings scale to `60 + cost*34`px).

### 10 · Foil / metal (SUBSCRIBER — feature-flag)
Luminance-aware holographic treatment that works over **any** art with no per-card masking:
- Rainbow gradient layer blended with `mix-blend-mode: color-dodge` (brightens light areas, spares shadows — like real reflection), animated `holoShift` 7s.
- A specular sweep band `mix-blend-mode: overlay`, `sheen` 4s.
- A rainbow edge trace: conic-gradient border, `rainbowSpin` 4s, slight blur.
Provide an on/off toggle (opacity crossfade `.45s`).

### Cosmetics — floating combat text, coin flip (implemented in prototype)
- **Floating combat text** — damage/heal numbers float up and fade (`spawnCombat`, 1100ms), colored `--danger` / `--good`.
- **Coin flip** — 3D `rotateY` coin, HEADS/TAILS faces with `backface-visibility: hidden`, purple/blue radial faces.

### Cosmetics roadmap (DO NOT implement — shelf only)
Playmats · card sleeves · tap styles · life-counter styles · dice & tokens · avatar frames ·
emotes · cursors & reticles · victory screens · cast trails · name plates · sound packs.

---

## Feature Flags / Subscriber Gating
Gate these behind a subscriber flag (only subscribers see them):
- **Spellcast ripple** (section 09)
- **Foil / metal** (section 10)

Architect the cosmetics as a pluggable layer so roadmap items (above) can be added later
without touching core play logic.

---

## Interactions & Behavior Reference
Exact timings and logic live in the `<script>` of `Manabase Design System 0.2v.dc.html`.
Key handlers to translate: `applyTheme` / `hexToRgba` (token derivation), `playTick` (life
flash), `reelStyle` (odometer), `spawnAt` (ripple), `spawnCombat` (floating text),
`triggerBurst` (big moment), `flipCoin` (coin). Read these for canonical durations/easings
rather than reinventing them.

---

## Guardrails (from the brief)
- Don't add fills where a hairline will do.
- Don't use mana colors for buttons/panels — breaks HUD calm.
- Don't over-animate ambient UI; save intensity for events.
- Keep numbers monospace + tabular.
- New surfaces use CSS variables, not hard-coded hex.
- **Dark-mode only — do not design or implement a light theme.**

## Assets
- **Fonts:** Space Grotesk + Space Mono (Google Fonts).
- **Card art:** the prototype uses striped-SVG placeholders. Replace with real card imagery in the app.
- No other bundled image assets.

## Files in this bundle
- `Manabase Design System 0.2v.dc.html` — latest interactive reference.
- `DESIGN_SYSTEM.md` — written brief (the *why*).
