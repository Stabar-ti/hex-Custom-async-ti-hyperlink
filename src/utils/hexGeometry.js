// @ts-check
// ─────────────────────────────────────────────────────────────────────────────
// hexGeometry.js — where a hex's corners and edges are in pixels.
//
// The companion to hexGrid.js, which owns the axial side of the same subject.
// This one is also DOM-free and dependency-free, so it can be used from the
// drawing layer, the overlays and plain-Node tests alike.
//
// WHY IT EXISTS
//
// Seven files had computed hex corners by hand, in two conventions:
//
//   60·i          drawHexes, valueOverlay, pasteGhost, hyperlaneGeometry.hexCorners
//   60·s − 120    borderAnomaliesDraw, miltyBuilderDraw, hyperlaneGeometry.edgeMid
//
// They agree — both produce the same six points, and a polygon drawn from either
// is the same hexagon — but only the second ordering can be indexed by side, and
// that is load-bearing: borderAnomaliesDraw and miltyBuilderDraw both take
// `verts[side]` and `verts[side + 1]` as the two ends of that side, which is true
// only when the list starts at −120°.
//
// So there is one angle formula here and two views onto it: a vertex list ordered
// so that side `s` runs from `v[s]` to `v[s + 1]`, and a points string for drawing
// an outline, where the starting vertex does not matter.
//
// The side indices are hexGrid's: 0 = N, 1 = NE, 2 = SE, 3 = S, 4 = SW, 5 = NW.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{x: number, y: number}} Point
 */

/**
 * Corner `i` of a hex, in the ordering that makes side indices work.
 *
 * @param {Point} center
 * @param {number} radius
 * @param {number} i  0..5 (values outside wrap, so `i + 1` is safe)
 * @returns {Point}
 */
export function hexVertex(center, radius, i) {
    const angle = (Math.PI / 180) * (60 * i - 120);
    return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
    };
}

/**
 * All six corners, ordered so that side `s` runs from `v[s]` to `v[(s + 1) % 6]`.
 *
 * @param {Point} center
 * @param {number} radius
 * @returns {Point[]}
 */
export function hexVertices(center, radius) {
    return Array.from({ length: 6 }, (_, i) => hexVertex(center, radius, i));
}

/**
 * The two corners bounding one side.
 *
 * @param {Point} center
 * @param {number} radius
 * @param {number} side  0..5
 * @returns {[Point, Point]}
 */
export function sideCorners(center, radius, side) {
    return [hexVertex(center, radius, side), hexVertex(center, radius, side + 1)];
}

/**
 * The midpoint of one side.
 *
 * @param {Point} center
 * @param {number} radius
 * @param {number} side  0..5
 * @returns {Point}
 */
export function edgeMidpoint(center, radius, side) {
    const [a, b] = sideCorners(center, radius, side);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The six corners as an SVG `points` attribute.
 *
 * Which corner it starts from does not matter for a closed outline, so this is the
 * same list as hexVertices — one formula rather than a second one that happens to
 * agree.
 *
 * @param {Point} center
 * @param {number} radius
 * @returns {string} e.g. '40,0 20,34.6 -20,34.6 …'
 */
export function hexPoints(center, radius) {
    return hexVertices(center, radius).map(p => `${p.x},${p.y}`).join(' ');
}
