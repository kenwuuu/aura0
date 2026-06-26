// World-space coordinate constants for the react-flow battlefield.
//
// All players share one coordinate space. Each player gets a "playmat" region;
// mats are arranged in a two-row grid extending rightward.
//
// Seat assignment: each player's seatIndex is determined by join order
// (stored as YSTATE_JOINED_AT in their Yjs map) so the layout is identical
// on every peer and stable as players join.
//
// Grid layout (0-indexed seats):
//   Top row:    seats 1, 3, 5 …   (y = 0)
//   Bottom row: seats 0, 2, 4 …   (y = MAT_HEIGHT + MAT_ROW_GAP)
// Each new column is added to the right as more players join.

// ── Playmat dimensions ──────────────────────────────────────────────────────
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';
export { CARD_WIDTH, CARD_HEIGHT };

// Playmat: 28 cards wide × 5 cards tall.
export const PX_PER_INCH = 25.4;
export const MAT_WIDTH  = Math.round(28 * PX_PER_INCH); // 711 px
export const MAT_HEIGHT = 5 * CARD_HEIGHT;               // 440 px

// Gaps between mats in the grid
export const MAT_COL_GAP = 80;   // px between columns
export const MAT_ROW_GAP = 60;   // px between rows

// ── Seat → mat top-left origin ───────────────────────────────────────────────
/** Top-left of the playmat for a given seat index (flow/world coordinates). */
export function seatOrigin(seatIndex: number): { x: number; y: number } {
  const col = Math.floor(seatIndex / 2);
  const isBottom = seatIndex % 2 === 0; // even seats on bottom row
  return {
    x: col * (MAT_WIDTH + MAT_COL_GAP),
    y: isBottom ? MAT_HEIGHT + MAT_ROW_GAP : 0,
  };
}

// ── Mat-relative widget offsets ───────────────────────────────────────────────
const HEALTH_OFFSET  = { x: 12, y: 12 };

// Piles sit in a vertical column on the right edge of the mat.
// Order top-to-bottom: deck, discard, exile, (opponent) hand.
const PILE_COL_X   = MAT_WIDTH - CARD_WIDTH - 12;
const PILE_START_Y = 12;
const PILE_GAP     = 10;

/** Absolute flow positions for all per-player board widgets at a given seat. */
export function playmatNodePositions(seatIndex: number) {
  const o = seatOrigin(seatIndex);
  const pileY = (i: number) => o.y + PILE_START_Y + i * (CARD_HEIGHT + PILE_GAP);
  return {
    mat:     { x: o.x,              y: o.y },
    health:  { x: o.x + HEALTH_OFFSET.x, y: o.y + HEALTH_OFFSET.y },
    deck:    { x: o.x + PILE_COL_X, y: pileY(0) },
    discard: { x: o.x + PILE_COL_X, y: pileY(1) },
    exile:   { x: o.x + PILE_COL_X, y: pileY(2) },
    hand:    { x: o.x + PILE_COL_X, y: pileY(3) },
  };
}

// ── Legacy band constants (kept for reference; superseded by seat grid) ───────
export const BAND_WIDTH = 2400;
export const BAND_HEIGHT = 900;
export const BAND_GAP = 100;
/** @deprecated Use seatOrigin() instead. */
export function playerBandOrigin(bandIndex: number): { x: number; y: number } {
  return { x: 0, y: bandIndex * (BAND_HEIGHT + BAND_GAP) };
}

// ── World bounds ──────────────────────────────────────────────────────────────
export const WORLD_MIN_X = -500;
export const WORLD_MIN_Y = -500;
export const WORLD_MAX_X = 6 * (MAT_WIDTH + MAT_COL_GAP) + 500;  // supports up to 6+ players
export const WORLD_MAX_Y = 2 * MAT_HEIGHT + MAT_ROW_GAP + 500;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 20;
