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
