/**
 * The matrix algebra behind hyperlanes — every rule about what a 6×6 link matrix means,
 * with no DOM, no editor and no imports from the app. This module loads under node for
 * tools/test-hyperlanes.js.
 *
 * It exists because those rules were previously scattered across four files that each
 * re-derived them:
 *
 *   - The A→B→C click rule (which two edges a three-hex path implies, when it is a
 *     self-loop, when it is invalid) lived inline in hyperlanes.js:66-88, tangled with
 *     saveState calls and SVG drawing, so it could only be exercised by clicking.
 *   - The de-duplication of a symmetric matrix into a drawing plan was a `drawnPairs`
 *     Set built inside the render loop (hyperlanes.js:186-208).
 *   - Rotation was a nested function inside a UI event handler
 *     (tileCopyPasteWizard.js:371-380).
 *   - Symmetrisation was a raw double loop that MUTATED the caller's matrix in place
 *     during a read-only distance query (drawDistances.js:197-203) — running a distance
 *     calculation permanently rewrote the user's one-way drawn links.
 *
 * That last one is why every transform here returns a NEW matrix and never mutates its
 * argument. It is also what makes each of them a one-line assertion in the tests.
 *
 * The one deliberate exception to return-new lives outside this file: hyperlaneRender's
 * `clearHex` zeroes hex.matrix in place, because import.js:233 aliases
 * `hex.links = hex.matrix` and tileCopyPasteWizard.js:504-508 documents a dependency on
 * the in-place behaviour. Rebinding there would leave those aliases stale.
 *
 * Edge indices are 0-5 matching `edgeDirections` in constants.js:25 (NW, NE, E, SE, SW, W),
 * and `matrix[entry][exit] === 1` means "a ship entering this tile across edge `entry`
 * may leave across edge `exit`".
 */

// One import surface: callers and tests get the codec from here rather than reaching
// past this module into utils/matrix.js. That file stays where it is — export.js,
// import.js, tileCopyPasteWizard.js and loreEffectPickers.js import it directly and have
// no other reason to know this module exists.
export { matrixToHex, hexToMatrix, hasLinks, isMatrixEmpty } from '../../utils/matrix.js';

/** Number of hex edges. Every matrix is SIDES × SIDES. */
export const SIDES = 6;

/**
 * Axial offsets per edge index.
 *
 * This used to be a local copy, kept separate so the module stayed free of app imports and
 * went on loading under node. `utils/hexGrid.js` is now the one home for axial grid math
 * and is itself dependency-free and DOM-free, so the copy is gone and the two can no longer
 * drift apart. Re-exported here because callers of this module expect the name.
 */
import { EDGE_DIRECTIONS } from '../../utils/hexGrid.js';
export { EDGE_DIRECTIONS };

// ── Construction ──────────────────────────────────────────────────────────────

/** A fresh all-zero 6×6 matrix. */
export function emptyMatrix() {
    return Array.from({ length: SIDES }, () => Array(SIDES).fill(0));
}

/**
 * Deep copy. Tolerant of null/undefined/malformed input — returns a valid empty matrix
 * rather than throwing, because callers routinely hand over `hex.matrix` from hexes that
 * were built by an older import path.
 */
export function cloneMatrix(m) {
    if (!Array.isArray(m) || m.length !== SIDES) return emptyMatrix();
    return Array.from({ length: SIDES }, (_, i) =>
        Array.from({ length: SIDES }, (_, j) => (Array.isArray(m[i]) && m[i][j] === 1 ? 1 : 0))
    );
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Bounds-safe read. Out-of-range indices are `false`, not a throw. */
export function hasLink(m, entry, exit) {
    if (!Array.isArray(m)) return false;
    if (!isSide(entry) || !isSide(exit)) return false;
    return m[entry]?.[exit] === 1;
}

/** How many cells are set. Counts the raw matrix, not de-duplicated segments. */
export function linkCount(m) {
    if (!Array.isArray(m)) return 0;
    let n = 0;
    for (const row of m) for (const cell of row || []) if (cell === 1) n++;
    return n;
}

/** The edge directly across the tile from `side`. */
export function oppositeSide(side) {
    return (Number(side) + 3) % SIDES;
}

function isSide(n) {
    return Number.isInteger(n) && n >= 0 && n < SIDES;
}

// ── Transforms — all return a new matrix, never mutate ─────────────────────────

/** A copy with one cell set. Out-of-range indices return an unchanged copy. */
export function withLink(m, entry, exit, value = 1) {
    const out = cloneMatrix(m);
    if (isSide(entry) && isSide(exit)) out[entry][exit] = value ? 1 : 0;
    return out;
}

/** A copy with one cell cleared. */
export function withoutLink(m, entry, exit) {
    return withLink(m, entry, exit, 0);
}

/**
 * A copy in which every link is bidirectional.
 *
 * Drawing writes only `[entry][exit]` (one direction), but traversal and export both need
 * both directions. Previously each did its own in-place double loop; drawDistances.js's
 * version corrupted the user's data. Callers now symmetrise into a copy they own.
 */
export function symmetrised(m) {
    const out = cloneMatrix(m);
    for (let i = 0; i < SIDES; i++) {
        for (let j = 0; j < SIDES; j++) {
            if (out[i][j] === 1) out[j][i] = 1;
        }
    }
    return out;
}

/**
 * A copy rotated `dir` sixths of a turn clockwise. Both indices move, because both name
 * an edge. Negative and >6 values are normalised, so rotated(m, -1) === rotated(m, 5).
 *
 * Hoisted verbatim from tileCopyPasteWizard.js:371-380, where it was a nested function
 * inside a UI handler and therefore untestable.
 */
export function rotated(m, dir) {
    const src = cloneMatrix(m);
    const shift = ((Math.trunc(dir) % SIDES) + SIDES) % SIDES;
    const out = emptyMatrix();
    for (let i = 0; i < SIDES; i++) {
        for (let j = 0; j < SIDES; j++) {
            out[(i + shift) % SIDES][(j + shift) % SIDES] = src[i][j];
        }
    }
    return out;
}

// ── Segment enumeration ───────────────────────────────────────────────────────

/**
 * Stable identity for a link, used to collapse a symmetric matrix into one drawing.
 * Self-loops are keyed 'l{side}'; curves are keyed low-comma-high so that {2,4} and {4,2}
 * are the same segment. Loop keys carry the 'l' prefix so they can never collide.
 */
export function segmentKey(entry, exit) {
    if (entry === exit) return `l${entry}`;
    return `${Math.min(entry, exit)},${Math.max(entry, exit)}`;
}

/**
 * The de-duplicated drawing plan for a matrix: exactly the SVG that should exist for a
 * hex, in a stable order, with each visual segment appearing once however many matrix
 * cells imply it.
 *
 * This is the single source of truth that makes `renderHex` idempotent. When the whole of
 * a hex's SVG is re-derived from this list on every change, matrix/DOM divergence stops
 * being possible — which is what dissolves the orphaned-loop-circle bug in the old
 * `_unlink` (hyperlanes.js:130-139), where the circle carried no entry/exit dataset and so
 * could never be found for removal.
 *
 * @param {number[][]} matrix
 * @returns {Array<{kind: 'curve'|'loop', entry: number, exit: number, key: string}>}
 */
export function segments(matrix) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(matrix)) return out;

    for (let entry = 0; entry < SIDES; entry++) {
        for (let exit = 0; exit < SIDES; exit++) {
            if (matrix[entry]?.[exit] !== 1) continue;
            const key = segmentKey(entry, exit);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(entry === exit
                ? { kind: 'loop', entry, exit: entry, key }
                : { kind: 'curve', entry, exit, key });
        }
    }
    return out;
}

// ── Roundabouts ───────────────────────────────────────────────────────────────
//
// A roundabout is a tile where every lane that reaches it connects to every other: a
// ship coming in through any of its sides can leave through any other. The diagonal is
// what marks it — `m[d][d] === 1` puts side d on the roundabout, and hyperlaneTraversal
// chains those sides to one another.
//
// A roundabout is also written out as the full set of links between its members, not
// just the diagonal. Export hands the matrix to AsyncTI4 as it is, and a diagonal-only
// roundabout depends on the bot chaining diagonals the way traversal does. With every
// pair written out, the lanes join whichever way the matrix is read.
//
// A roundabout does not share its tile with ordinary lanes. A lane between two of its
// sides would only say again what the roundabout already says, and a lane drawn past a
// roundabout was drawn straight through the circle. So a lane drawn onto a roundabout
// tile joins the roundabout with both of its ends, and a roundabout started on a tile
// that already has lanes takes those lanes' ends in as well.

/** The sides on the tile's roundabout, ascending. Empty when there is none. */
export function roundaboutSides(m) {
    const out = [];
    if (!Array.isArray(m)) return out;
    for (let d = 0; d < SIDES; d++) if (m[d]?.[d] === 1) out.push(d);
    return out;
}

export function hasRoundabout(m) {
    return roundaboutSides(m).length > 0;
}

/** Every side any link on the tile touches. */
function linkedSides(m) {
    const out = new Set();
    for (let i = 0; i < SIDES; i++) {
        for (let j = 0; j < SIDES; j++) {
            if (m[i][j] === 1) { out.add(i); out.add(j); }
        }
    }
    return out;
}

/** Every member linked to every member, itself included. */
function roundaboutOver(sides) {
    const out = emptyMatrix();
    for (const i of sides) for (const j of sides) out[i][j] = 1;
    return out;
}

/**
 * A copy in which the tile is one roundabout: `sides`, plus every side the tile's
 * links already reach.
 */
export function withRoundabout(m, sides) {
    const members = linkedSides(cloneMatrix(m));
    for (const s of sides || []) if (isSide(s)) members.add(s);
    return roundaboutOver(members);
}

/**
 * A copy with `sides` taken off the roundabout: their diagonal cell and their links to
 * the other members are cleared, and any other lane on those sides is left as it is. A
 * roundabout with no members left is simply gone.
 */
export function withoutRoundaboutSides(m, sides) {
    const out = cloneMatrix(m);
    const members = roundaboutSides(out);
    for (const r of sides || []) {
        if (!members.includes(r)) continue;
        for (const s of members) { out[r][s] = 0; out[s][r] = 0; }
    }
    return out;
}

/**
 * What drawing a lane from `entry` to `exit` across this tile does to its matrix.
 *
 * A lane that goes back out the side it came in by (`entry === exit`) puts that side on
 * a roundabout. Any lane drawn onto a roundabout tile joins it at both ends. Otherwise
 * it is an ordinary link, written in both directions.
 */
export function withLaneDrawn(m, entry, exit) {
    if (!isSide(entry) || !isSide(exit)) return cloneMatrix(m);
    if (entry === exit || hasRoundabout(m)) return withRoundabout(m, [entry, exit]);
    return withLink(withLink(m, entry, exit), exit, entry);
}

/**
 * What erasing the lane from `entry` to `exit` does — the inverse of withLaneDrawn.
 *
 * On a roundabout the lane is its two ends being members, so erasing it takes both ends
 * off. A lane that was drawn as its own link on top of a roundabout (only an import can
 * produce one) is removed as that link, and the roundabout is left alone.
 */
export function withLaneErased(m, entry, exit) {
    if (!isSide(entry) || !isSide(exit)) return cloneMatrix(m);
    if (entry === exit) return withoutRoundaboutSides(m, [entry]);
    const members = roundaboutSides(m);
    if (members.includes(entry) && members.includes(exit)) {
        return withoutRoundaboutSides(m, [entry, exit]);
    }
    return withoutLink(withoutLink(m, entry, exit), exit, entry);
}

/** Whether two matrices set the same cells. */
export function sameMatrix(a, b) {
    const x = cloneMatrix(a);
    const y = cloneMatrix(b);
    return x.every((row, i) => row.every((cell, j) => cell === y[i][j]));
}

/**
 * What to draw for a tile: the roundabout's sides, and the lanes that are not already
 * the roundabout.
 *
 * `segments` lists every link in the matrix. A lane between two roundabout sides is one
 * of them, and drawing it put a line through the middle of the circle to say something
 * the circle already said. It is left out here. A lane with an end off the roundabout
 * means something the roundabout does not, so it stays.
 *
 * @returns {{roundabout: number[], curves: Array<{kind: 'curve', entry: number, exit: number, key: string}>}}
 */
export function drawPlan(m) {
    const roundabout = roundaboutSides(m);
    const on = new Set(roundabout);
    const curves = segments(m).filter(s =>
        s.kind === 'curve' && !(on.has(s.entry) && on.has(s.exit)));
    return { roundabout, curves };
}

// ── Direction and path resolution ─────────────────────────────────────────────

/**
 * Whether two axial coordinates are direct neighbours.
 * @param {{q: number, r: number}} a
 * @param {{q: number, r: number}} b
 */
export function areNeighbors(a, b) {
    return dirIndexBetween(a, b) >= 0;
}

/**
 * The edge index 0-5 of `to` as seen from `from`, or -1 when they are not neighbours.
 * (Was `getDirIndex` in draw/links.js.)
 * @param {{q: number, r: number}} from
 * @param {{q: number, r: number}} to
 */
export function dirIndexBetween(from, to) {
    if (!from || !to) return -1;
    const dq = to.q - from.q;
    const dr = to.r - from.r;
    return EDGE_DIRECTIONS.findIndex(d => d.q === dq && d.r === dr);
}

/**
 * Turns three consecutive clicked labels into the segment they imply, or null if the path
 * does not describe one.
 *
 * `coords` is a plain `{ [label]: {q, r} }` record rather than the editor, so the A→B→C
 * rule can be stated and tested without a map, a DOM or a click. It folds together three
 * things that were interleaved with drawing and history calls in hyperlanes.js:66-88:
 * the entry/exit derivation, the `A === C && A !== B` self-loop case, and the guard
 * against non-adjacent labels that would otherwise write matrix[-1][-1].
 *
 * For a loop the result has `entry === exit`, so callers have one shape to handle.
 *
 * @returns {{via: string, entry: number, exit: number, kind: 'curve'|'loop'} | null}
 */
export function resolveSegment(coords, A, B, C) {
    const via = coords?.[B];
    const from = coords?.[A];
    const to = coords?.[C];
    if (!via || !from || !to) return null;
    // A path must pass THROUGH B; a repeated label describes no crossing.
    if (A === B || B === C) return null;

    const entry = dirIndexBetween(via, from);
    const exit = dirIndexBetween(via, to);
    if (entry < 0 || exit < 0) return null;

    if (A === C) return { via: B, entry, exit: entry, kind: 'loop' };
    return { via: B, entry, exit, kind: 'curve' };
}
