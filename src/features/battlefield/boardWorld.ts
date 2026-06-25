// World-space coordinate constants for the react-flow battlefield.
//
// All players share one coordinate space. Each player's "home zone" is a
// horizontal band; the first band starts at y=0. Players joined to the room
// are stacked vertically so each can pan to their own area.

export const BAND_WIDTH = 2400;   // px — horizontal extent per player
export const BAND_HEIGHT = 900;   // px — vertical extent per player
export const BAND_GAP = 100;      // px — gap between player bands

/** Top-left origin (in flow space) for a given player index (0 = local). */
export function playerBandOrigin(bandIndex: number): { x: number; y: number } {
  return { x: 0, y: bandIndex * (BAND_HEIGHT + BAND_GAP) };
}

export const WORLD_MIN_X = -500;
export const WORLD_MIN_Y = -500;
export const WORLD_MAX_X = BAND_WIDTH + 500;
export const WORLD_MAX_Y = 4 * (BAND_HEIGHT + BAND_GAP) + 500; // supports up to 4 players

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;
