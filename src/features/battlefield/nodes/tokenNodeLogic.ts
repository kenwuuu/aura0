/**
 * Pure ownership/count logic for a battlefield keyword token — no React, no Yjs.
 *
 * Extracted from `TokenNode` so the durable rule (only the owner may change a
 * token's count) is unit-testable in isolation and survives the design-system
 * rewrite of the node's markup.
 */

/** Only the token's owner may modify its count. */
export function isOwnToken(ownerId: string, localPlayerId: string): boolean {
  return ownerId === localPlayerId;
}

/** Next count after applying `delta`, treating a missing count as 0. */
export function applyTokenDelta(count: number | undefined, delta: number): number {
  return (count ?? 0) + delta;
}

/**
 * Whether a click at `clientY` landed in the top half of an element spanning
 * [rectTop, rectTop + rectHeight). Drives the token's click-to-adjust gesture:
 * top half = +1, bottom half = -1 (replaces the old left-click-always-+1 /
 * right-click-always--1 scheme now that right-click opens the context menu).
 */
export function clickedTopHalf(clientY: number, rectTop: number, rectHeight: number): boolean {
  return clientY - rectTop < rectHeight / 2;
}
