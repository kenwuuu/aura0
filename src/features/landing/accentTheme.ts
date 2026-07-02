/**
 * accentTheme.ts — the themeable-knob logic from the design brief.
 *
 * `--glow` and `--glow-strong` are DERIVED from the accent color at runtime, so a
 * single call reskins every glow, focus ring and bloom in the system. This mirrors
 * the prototype's `applyTheme()` / `hexToRgba()`. Dark-mode only by design.
 */

/** Parse a #rrggbb hex into an `r, g, b` string usable inside rgba(). */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Set the brand accent and rederive every accent-dependent token.
 * @param accentHex canonical brand color, e.g. '#9B5CFF'
 * @param glowMult  intensity multiplier for the derived glow (1 = default)
 */
export function setAccent(accentHex: string, glowMult = 1): void {
  const rgb = hexToRgb(accentHex);
  const root = document.documentElement.style;
  root.setProperty('--accent', accentHex);
  root.setProperty('--accent-soft', `rgba(${rgb}, 0.14)`);
  root.setProperty('--accent-line', `rgba(${rgb}, 0.45)`);
  root.setProperty('--glow', `rgba(${rgb}, ${0.5 * glowMult})`);
  root.setProperty('--glow-strong', `rgba(${rgb}, ${0.85 * glowMult})`);
}
