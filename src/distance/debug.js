// Verbose pathfinding logging for the distance engine.
// Flip DEBUG_DIST to true to trace every step, block and hyperlane hop.
export const DEBUG_DIST = false;

export function dbg(...args) {
  if (DEBUG_DIST) console.log(...args);
}
