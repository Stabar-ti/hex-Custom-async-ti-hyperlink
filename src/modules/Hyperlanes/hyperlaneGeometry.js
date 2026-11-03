/**
 * Pixel math for hyperlane links — where an edge midpoint is, what curve joins two of
 * them, how long a self-loop arm should be. Pure: returns numbers and SVG `d` strings,
 * never elements, so it loads under node for tools/test-hyperlanes.js.
 *
 * Split out of draw/links.js, where the geometry and the DOM construction were the same
 * functions and so neither could be checked without a browser. That file also hardcoded
 * two constants that should have been derived from the hex size:
 *
 *   - links.js:101 called `edgeMid(center, entry, 40)` with a literal 40 rather than the
 *     radius it was given, so self-loop arms detached from the hex edge at any zoom other
 *     than the default.
 *   - The arm length (14) and the loop circle radius (14) were fixed pixel defaults for
 *     the same reason.
 *
 * All three now scale with the radius. LOOP_SCALE is chosen so that at the default
 * hexRadius of 40 the derived values come out at exactly 14 — appearance is unchanged at
 * the default scale, and only non-default scales differ (which is the bug). A test locks
 * that equality in place.
 */

import { edgeMidpoint, hexPoints } from '../../utils/hexGeometry.js';

/** 14 / 40 — see the note above about preserving default-scale appearance. */
export const LOOP_SCALE = 0.35;

/** How far the quadratic control point is pulled from the hex centre toward the chord. */
export const DEFAULT_CURVE_PULL = 0.25;

/**
 * Midpoint of hex edge `side`, as the average of that edge's two corners.
 *
 * @param {{x: number, y: number}} center
 * @param {number} side   Edge index 0-5
 * @param {number} radius Hex radius in px
 * @returns {{x: number, y: number}}
 */
export function edgeMid(center, side, radius) {
    return edgeMidpoint(center, radius, side);
}

/**
 * The six corner points of a hex, as an SVG `points` string.
 *
 * Mirrors the corner formula in drawHexes.js:59-62 (angles 60°·i, flat-top). Used by the
 * indicator overlay to trace a hex without reading the polygon's own attributes, which may
 * be mid-update.
 *
 * @returns {string} e.g. '40,0 20,34.6 -20,34.6 …'
 */
export function hexCorners(center, radius) {
    return hexPoints(center, radius);
}

/**
 * The `d` attribute for a link curving from edge `entry` to edge `exit`.
 *
 * A quadratic whose control point sits between the hex centre and the chord midpoint, so
 * links bow toward the middle of the tile instead of cutting straight across it. `pull` of
 * 0 puts the control point at the centre; 1 makes it a straight line.
 *
 * @returns {string} e.g. 'M10,20 Q15,25 30,40'
 */
export function curvePath(center, entry, exit, radius, pull = DEFAULT_CURVE_PULL) {
    const { start, control, end } = curveControls(center, entry, exit, radius, pull);
    return `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`;
}

/** The three points of the quadratic curvePath draws, shared with curvePoint. */
function curveControls(center, entry, exit, radius, pull) {
    const start = edgeMid(center, entry, radius);
    const end = edgeMid(center, exit, radius);
    const control = {
        x: center.x + ((start.x + end.x) / 2 - center.x) * pull,
        y: center.y + ((start.y + end.y) / 2 - center.y) * pull,
    };
    return { start, control, end };
}

/**
 * How far in from its exit edge a one-way lane's arrowhead tip sits, as a fraction of the
 * centre-to-edge distance. A fixed depth from the edge, as the bot draws it
 * (OneWayHyperlaneOverlay.atDepthFromEnd), and not a fraction of the lane's length: then
 * every arrow sits out by its own side instead of all of them piling up mid-tile.
 */
export const ONE_WAY_ARROW_DEPTH = 0.16;

/**
 * A point on the `curvePath` from `entry` to `exit`, and the direction of travel there
 * (radians, SVG axes). `t` runs 0 at the entry edge to 1 at the exit edge.
 *
 * @returns {{x: number, y: number, angle: number}}
 */
export function curvePoint(center, entry, exit, radius, t = 0.5, pull = DEFAULT_CURVE_PULL) {
    const { start, control: { x: cx, y: cy }, end } = curveControls(center, entry, exit, radius, pull);
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * cx + t * t * end.x;
    const y = u * u * start.y + 2 * u * t * cy + t * t * end.y;
    const dx = 2 * u * (cx - start.x) + 2 * t * (end.x - cx);
    const dy = 2 * u * (cy - start.y) + 2 * t * (end.y - cy);
    return { x, y, angle: Math.atan2(dy, dx) };
}

/**
 * Where a one-way lane's arrowhead goes: the last point on its curve that is still
 * ONE_WAY_ARROW_DEPTH in from the exit edge, with the direction of travel there.
 *
 * @returns {{x: number, y: number, angle: number}}
 */
export function oneWayArrowPoint(center, entry, exit, radius, pull = DEFAULT_CURVE_PULL) {
    const end = edgeMid(center, exit, radius);
    const inX = center.x - end.x;
    const inY = center.y - end.y;
    const edgeDistance = Math.hypot(inX, inY);
    const want = ONE_WAY_ARROW_DEPTH * edgeDistance;
    for (let t = 1; t >= 0.5; t -= 0.01) {
        const p = curvePoint(center, entry, exit, radius, t, pull);
        if (((p.x - end.x) * inX + (p.y - end.y) * inY) / edgeDistance >= want) return p;
    }
    return curvePoint(center, entry, exit, radius, 0.5, pull);
}

/**
 * The arrowhead for a side that several one-way lanes all leave by: ONE_WAY_ARROW_DEPTH in
 * from that edge, pointing straight out through it. Drawn once instead of once per lane,
 * where the arrows would stack on the same spot.
 *
 * @returns {{x: number, y: number, angle: number}}
 */
export function sideArrowPoint(center, side, radius) {
    const end = edgeMid(center, side, radius);
    return {
        x: end.x + (center.x - end.x) * ONE_WAY_ARROW_DEPTH,
        y: end.y + (center.y - end.y) * ONE_WAY_ARROW_DEPTH,
        angle: Math.atan2(end.y - center.y, end.x - center.x),
    };
}

/**
 * The `points` of a notched arrowhead whose tip is at `tip`, pointing along `angle` — the
 * bot's shape (OneWayHyperlaneOverlay.arrowHead). Sized from the hex radius so it scales
 * with the map.
 */
export function arrowPoints(tip, angle, radius) {
    const len = radius * 0.2;
    const half = radius * 0.1;
    const notch = radius * 0.14;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // In arrow space: x runs back from the tip, y across it.
    const at = (x, y) => [tip.x - x * cos - y * sin, tip.y - x * sin + y * cos];
    return [at(0, 0), at(len, -half), at(notch, 0), at(len, half)]
        .map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Endpoints of the stub joining edge `entry` to the self-loop circle.
 *
 * The arm runs from the edge midpoint inward and stops ON the loop circle's perimeter,
 * so the two marks meet instead of overlapping or leaving a gap.
 *
 * links.js:99-125 got this right but described it wrongly: its `armLength = 14` parameter
 * read as the length of the stub, when the code actually used it as a distance back from
 * the CENTRE — which is the circle's radius. The drawn stub at the default hex size is
 * 20.64px long, not 14. Naming it `loopCircleRadius` here keeps the same geometry while
 * saying what the number is, and means one constant drives both marks.
 *
 * @returns {{x1: number, y1: number, x2: number, y2: number}}
 */
export function loopArm(center, entry, radius) {
    const start = edgeMid(center, entry, radius);
    const dx = center.x - start.x;
    const dy = center.y - start.y;
    const len = Math.hypot(dx, dy);
    // A degenerate radius would divide by zero; a zero-length stub is the honest answer.
    if (!len) return { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    // Walk back from the centre by the circle's radius, along the line to the edge.
    const t = loopCircleRadius(radius) / len;
    return { x1: start.x, y1: start.y, x2: center.x - dx * t, y2: center.y - dy * t };
}

/**
 * Radius of the circle marking a self-loop, and equally the point at which the arm stops.
 * 14px at the default hex radius of 40, matching links.js:137's old fixed default.
 *
 * Always shorter than the apothem (0.35 < cos 30° ≈ 0.866), so the arm never inverts.
 */
export function loopCircleRadius(radius) {
    return radius * LOOP_SCALE;
}
