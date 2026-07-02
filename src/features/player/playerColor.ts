/**
 * Deterministic player color derived from the stable playerId.
 * Same input → same HSL color every time, across all peers.
 * Used as the default until a color picker writes YSTATE_PLAYER_COLOR.
 */
export function colorFromPlayerId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 60%)`;
}
