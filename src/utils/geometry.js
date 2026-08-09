// Geometry utilities
//
// Thin compatibility layer over utils/hexGrid.js, which is the canonical home
// for axial hex math. Prefer importing from hexGrid.js directly in new code.
import { EDGE_DIRECTIONS, neighborCoord } from './hexGrid.js';

export { axialDistance as hexDistance } from './hexGrid.js';

export const directions = EDGE_DIRECTIONS;

export function getNeighbors(q, r) {
  return EDGE_DIRECTIONS.map((_, side) => neighborCoord(q, r, side));
}
