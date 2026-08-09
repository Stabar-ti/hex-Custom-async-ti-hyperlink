// ─────────────────────────────────────────────────────────────────────────────
// hexGrid.js — the single home for axial hex-grid math.
//
// This module is deliberately dependency-free and DOM-free so it can be used
// from the distance engine, the drawing layer, the import/export code, and from
// plain-Node test scripts alike.
//
// The 6 side indices are used everywhere as `0..5` and their meaning is fixed by
// EDGE_DIRECTIONS below. Together with the pixel math in drawHexes.hexToPixel
// (flat-top layout) and the edge midpoints in draw/links.edgeMid, the sides are:
//
//   0 = N   1 = NE   2 = SE   3 = S   4 = SW   5 = NW
//
// (Several older comments in this repo label these NW/NE/E/SE/SW/W. That naming
// is wrong; the index -> edge mapping itself has always been consistent.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The 6 axial neighbour offsets, indexed by side (0..5).
 * Frozen: this array is shared by every module in the app and must never be
 * mutated in place.
 */
export const EDGE_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 0, r: 1 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: -1, r: 0 }),
]);

/**
 * Coerce a side to a number in 0..5.
 *
 * Accepts a string as well, because `borderAnomalies` is a plain object and
 * `Object.entries()` therefore hands back string keys.
 *
 * @returns {number} 0..5, or NaN if `side` was not a valid side
 */
export function normalizeSide(side) {
  const n = typeof side === 'number' ? side : parseInt(side, 10);
  return (Number.isInteger(n) && n >= 0 && n <= 5) ? n : NaN;
}

/**
 * The side facing back the other way. Border anomalies and hyperlane matrices
 * both key on this constantly.
 *
 * @param {number|string} side
 * @returns {number} 0..5, or NaN if `side` was not a valid side
 */
export function oppositeSide(side) {
  const n = normalizeSide(side);
  return Number.isNaN(n) ? NaN : (n + 3) % 6;
}

/**
 * Axial coordinate of the neighbour across the given side.
 * @returns {{q:number, r:number}|null} null if `side` is not 0..5
 */
export function neighborCoord(q, r, side) {
  const dir = EDGE_DIRECTIONS[side];
  if (!dir) return null;
  return { q: q + dir.q, r: r + dir.r };
}

/**
 * True when a hex has real axial coordinates.
 *
 * The four corner hexes (TL/TR/BL/BR) are created with `q: null, r: null`
 * because they sit outside the grid — see drawHexes.drawCornerHex. Any code
 * doing coordinate arithmetic has to skip them, otherwise `null + 1` silently
 * evaluates to `1` and the corner appears to neighbour the middle of the map.
 */
export function hasAxialCoords(hex) {
  return !!hex && Number.isFinite(hex.q) && Number.isFinite(hex.r);
}

/** Map key for a coordinate index. */
function coordKey(q, r) {
  return `${q},${r}`;
}

/**
 * Build a `"q,r" -> label` lookup for O(1) neighbour resolution.
 * Hexes without axial coordinates (the corner hexes) are omitted.
 *
 * @param {Object<string, object>} hexes - editor.hexes
 * @returns {Map<string, string>}
 */
export function buildCoordIndex(hexes) {
  const index = new Map();
  for (const [label, hex] of Object.entries(hexes)) {
    if (!hasAxialCoords(hex)) continue;
    index.set(coordKey(hex.q, hex.r), label);
  }
  return index;
}

/**
 * Label of the neighbour of `hex` across `side`, or null.
 * @param {Map<string,string>} coordIndex - from buildCoordIndex
 */
export function neighborLabel(coordIndex, hex, side) {
  if (!hasAxialCoords(hex)) return null;
  const c = neighborCoord(hex.q, hex.r, side);
  if (!c) return null;
  return coordIndex.get(coordKey(c.q, c.r)) ?? null;
}

/**
 * Neighbour hex object across `side`, or null.
 * @param {Object<string,object>} hexes - editor.hexes
 * @param {Map<string,string>} coordIndex - from buildCoordIndex
 */
export function neighborHex(hexes, coordIndex, hex, side) {
  const label = neighborLabel(coordIndex, hex, side);
  return label ? (hexes[label] ?? null) : null;
}

/**
 * Which side of `hexA` faces `hexB`, if they are directly adjacent.
 * @returns {number|undefined} 0..5, or undefined when they are not neighbours
 */
export function sideBetween(hexA, hexB) {
  if (!hasAxialCoords(hexA) || !hasAxialCoords(hexB)) return undefined;
  const dq = hexB.q - hexA.q;
  const dr = hexB.r - hexA.r;
  const idx = EDGE_DIRECTIONS.findIndex(d => d.q === dq && d.r === dr);
  return idx === -1 ? undefined : idx;
}

/** True when the two hexes are directly adjacent on the grid. */
export function areAxialNeighbors(hexA, hexB) {
  return sideBetween(hexA, hexB) !== undefined;
}

/**
 * Grid distance in hexes, ignoring every adjacency rule (hyperlanes, wormholes,
 * custom links, blockers). Straight-line "as the crow flies" only.
 */
export function axialDistance(a, b) {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.q + a.r - b.q - b.r),
    Math.abs(a.r - b.r)
  );
}
