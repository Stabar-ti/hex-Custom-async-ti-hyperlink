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
    const a1 = (Math.PI / 180) * (60 * side - 120);
    const a2 = (Math.PI / 180) * (60 * (side + 1) - 120);
    const x1 = center.x + radius * Math.cos(a1);
    const y1 = center.y + radius * Math.sin(a1);
    const x2 = center.x + radius * Math.cos(a2);
    const y2 = center.y + radius * Math.sin(a2);
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
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
    return Array.from({ length: 6 }, (_, i) => {
        const ang = (Math.PI / 180) * 60 * i;
        return `${center.x + radius * Math.cos(ang)},${center.y + radius * Math.sin(ang)}`;
    }).join(' ');
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
    const start = edgeMid(center, entry, radius);
    const end = edgeMid(center, exit, radius);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const cx = center.x + (mx - center.x) * pull;
    const cy = center.y + (my - center.y) * pull;
    return `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`;
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
