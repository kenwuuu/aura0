/**
 * Deterministic player color derived from the stable playerId.
 * Same input → same HSL color every time, across all peers.
 * Used as the default until the color picker in Settings > Profile writes
 * YSTATE_PLAYER_COLOR.
 */
export function colorFromPlayerId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 60%)`;
}

/**
 * Normalize any stored player color to the `#rrggbb` that `<input type="color">`
 * requires. Player colors are consumed everywhere else as opaque CSS color
 * strings (peer cursors, health nodes), so the default is an `hsl()` triple —
 * which the picker renders as black rather than the actual color. Anything
 * already hex, or unparseable, is passed through unchanged.
 */
export function playerColorToHex(color: string): string {
  const match = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(color.trim());
  if (!match) return color;

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  // Standard HSL→RGB: `f(n)` per the CSS Color 4 formulation.
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
