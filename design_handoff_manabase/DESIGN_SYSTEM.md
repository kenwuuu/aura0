# Manabase — Design System Brief

A one-page context transfer for the MTG web app's visual system.
The living reference is **`Manabase Design System.dc.html`**; this doc is the *why*.

---

## What we're building

A play interface for Magic that feels **modern, sleek, and fast**, and that gets
out of the way so the card art can perform. The chrome is quiet at rest and
**lights up when it matters**. Motion is a first-class citizen — the system is
designed to be animated heavily.

**One-line vibe:** techy / HUD — thin lines, precise data, esports-console calm,
purple energy.

---

## Principles

1. **Cards are the star.** UI recedes: hairline borders, mostly transparent
   panels, no heavy fills. If a panel competes with the art, it's wrong.
2. **Elevation is light, not shadow.** Depth reads as glow. Shadow is reserved
   for surfaces that genuinely leave the plane (floating menus).
3. **Data is tabular.** Every game count (life, deck, discard) uses monospace
   tabular figures so digits never shift as numbers tick.
4. **Calm at rest, dramatic on events.** Micro-interactions are fast and subtle
   (120–180ms). Big moments — casts, kills, wins — are earned and cinematic
   (400–700ms). Don't spend a "moment" on something routine.
5. **Sharp, not soft.** 4px base radius. Precise corners, never pillowy.
6. **Purple is the only brand energy.** Blue and pink exist but are rare. Color
   otherwise belongs to the cards and to semantic use (mana, state).

---

## Foundations

**Type** — Space Grotesk (display / UI, 300–600 weights) + Space Mono
(numbers, labels, HUD data; uppercase + letter-spacing for labels).

**Radius** — base **4px**. 2px inner chips, up to 8px on large containers.

**Spacing** — 4px grid (4 / 8 / 12 / 16 / 24 / 32). Compact, pro-tool density.

**Color**
- Surfaces: near-black cool base, raised panels, translucent surfaces.
- Brand: `--accent` bright purple `#9B5CFF` (everywhere), `--accent-2` blue
  `#6E7BFF` (secondary), `--accent-pink` `#FF5CAD` (sparingly).
- State: `--good` gain/connected, `--danger` damage/destroy, `--warn` priority.
- Mana (W/U/B/R/G): **data only** — pips, filters, log tags. Never chrome.
- Glow: `--glow` / `--glow-strong` are accent-derived; elevation = glow.

**Theming** — dark only. Colors are driven by CSS custom properties on the
root; accent + glow intensity are themeable knobs, but there is no light
variant — don't build one.

---

## Components (in the reference)

Buttons (primary/secondary/ghost/destroy/icon) · top toolbar · player panel with
animated clockwise border trace + life-change flash · zone counters with
odometer-reel digits · dropdown menus · card states (rest / hover / tapped /
targeted) · motion primitives.

## Signature motion & FX

- **Dependency links** — animated filaments for equip (mechanical, solid flow)
  and enchant/aura (magical, dotted, lighter).
- **Life counter** — sliding rotary reels; drawing rolls a digit in from below.

## Subscriber cosmetics
The following should be implemented and feature flagged so only subscribers
have access to exclusive UI elements.

- **Spellcast ripple** — cards splash onto the dot-grid board; ripple **size ∝
  mana cost**, **hue ∝ color**.
- **Foil / metal** — luminance-aware holo via `color-dodge` (brightens light art,
  spares shadows — like real reflection) + specular sweep + rainbow edge trace.
  Works over *any* art, no per-card masking.

## Subscriber cosmetics (roadmap, do not implement)

Playmats · card sleeves · tap styles · life-counter styles · dice & tokens ·
avatar frames · emotes · cursors & reticles · victory screens · cast trails ·
name plates · sound packs.

---

## Guardrails

- Don't add fills where a hairline will do.
- Don't use mana colors for buttons/panels — it breaks the HUD calm.
- Don't over-animate ambient UI; save intensity for events.
- Keep numbers monospace + tabular.
- New surfaces should use the CSS variables, not hard-coded hex.
- This system is dark-mode only — do not design or implement a light theme.
