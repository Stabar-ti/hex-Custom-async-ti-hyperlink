/**
 * Tests for the hyperlane matrix algebra and link geometry.
 *
 *   node tools/test-hyperlanes.js      (or: npm test)
 *
 * The hyperlane subsystem had no coverage at all, which is how a read-only distance query
 * came to permanently rewrite the user's drawn links (drawDistances.js:197-203) without
 * anyone noticing. The load-bearing blocks here are the two frozen copies of the old
 * implementations — `legacyRotateMatrix` and `legacyLoopback` — asserted against the new
 * pure functions across a matrix of inputs. Without those, "the map still looks right" is
 * the only available check on a refactor that moves every line of this code.
 *
 * These modules are pure — no DOM, no editor — so they import straight into node.
 */

import {
    SIDES, EDGE_DIRECTIONS,
    emptyMatrix, cloneMatrix, hasLink, linkCount, oppositeSide,
    withLink, withoutLink, symmetrised, rotated,
    segments, segmentKey,
    areNeighbors, dirIndexBetween, resolveSegment,
    matrixToHex, hexToMatrix, hasLinks, isMatrixEmpty
} from '../src/modules/Hyperlanes/hyperlaneModel.js';

import {
    LOOP_SCALE, edgeMid, curvePath, loopArm, loopCircleRadius, hexCorners
} from '../src/modules/Hyperlanes/hyperlaneGeometry.js';

import * as store from '../src/modules/Hyperlanes/hyperlaneState.js';
// Safe under node: the indicator only touches the DOM inside its functions.
import { activeLabel } from '../src/modules/Hyperlanes/hyperlaneIndicator.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

/** Deterministic PRNG so a failure is always reproducible. */
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function randomMatrix(rng, density = 0.25) {
    return Array.from({ length: SIDES }, () =>
        Array.from({ length: SIDES }, () => (rng() < density ? 1 : 0)));
}

// ── 1. Codec round-trip ───────────────────────────────────────────────────────

{
    const rng = makeRng(20260809);
    let ok = 0;
    for (let i = 0; i < 200; i++) {
        const m = randomMatrix(rng, 0.3);
        if (eq(hexToMatrix(matrixToHex(m)), m)) ok++;
    }
    check('codec round-trips 200 random matrices', ok === 200, `${ok}/200 survived`);

    check('all-zero matrix encodes to 000000000',
        matrixToHex(emptyMatrix()) === '000000000', matrixToHex(emptyMatrix()));

    const full = Array.from({ length: SIDES }, () => Array(SIDES).fill(1));
    check('all-one matrix encodes to nine f', matrixToHex(full) === 'fffffffff', matrixToHex(full));
    check('all-one matrix round-trips', eq(hexToMatrix('fffffffff'), full));

    // Bit ordering: row-major flatten, so [5][5] is the least significant bit.
    const lsb = withLink(emptyMatrix(), 5, 5);
    check('single bit at [5][5] is the LSB', matrixToHex(lsb) === '000000001', matrixToHex(lsb));

    const msb = withLink(emptyMatrix(), 0, 0);
    check('single bit at [0][0] is the MSB', matrixToHex(msb) === '800000000', matrixToHex(msb));

    check('hasLinks agrees with linkCount on the empty matrix',
        hasLinks(emptyMatrix()) === false && isMatrixEmpty(emptyMatrix()) === true);
    check('hasLinks agrees with linkCount on a populated matrix',
        hasLinks(lsb) === true && isMatrixEmpty(lsb) === false);
}

// ── 2. Construction and queries ───────────────────────────────────────────────

{
    check('emptyMatrix is 6x6 of zeros',
        emptyMatrix().length === SIDES && linkCount(emptyMatrix()) === 0);

    // Rows must be independent — a shared row reference would make one write set six cells.
    const m = emptyMatrix();
    m[0][0] = 1;
    check('emptyMatrix rows are not shared references', linkCount(m) === 1, `count ${linkCount(m)}`);

    check('cloneMatrix tolerates null', eq(cloneMatrix(null), emptyMatrix()));
    check('cloneMatrix tolerates a wrong-length array', eq(cloneMatrix([[1], [0]]), emptyMatrix()));
    check('cloneMatrix normalises non-1 truthy values to 0',
        linkCount(cloneMatrix([[2, 0, 0, 0, 0, 0], ...Array.from({ length: 5 }, () => Array(6).fill(0))])) === 0);

    const c = cloneMatrix(m);
    c[1][1] = 1;
    check('cloneMatrix is a deep copy', linkCount(m) === 1 && linkCount(c) === 2);

    check('hasLink is bounds-safe below range', hasLink(m, -1, 0) === false);
    check('hasLink is bounds-safe above range', hasLink(m, 0, 6) === false);
    check('hasLink is bounds-safe on non-integers', hasLink(m, 1.5, 0) === false);
    check('hasLink reads a set cell', hasLink(m, 0, 0) === true);

    for (let s = 0; s < SIDES; s++) {
        const d = EDGE_DIRECTIONS[s];
        const o = EDGE_DIRECTIONS[oppositeSide(s)];
        check(`oppositeSide(${s}) is the mirrored axial offset`, d.q === -o.q && d.r === -o.r);
    }
    check('oppositeSide is an involution',
        [0, 1, 2, 3, 4, 5].every(s => oppositeSide(oppositeSide(s)) === s));
}

// ── 3. Transforms never mutate ────────────────────────────────────────────────

{
    const rng = makeRng(7);
    const base = randomMatrix(rng, 0.3);
    const frozen = JSON.stringify(base);

    withLink(base, 0, 1);
    withoutLink(base, 0, 1);
    symmetrised(base);
    rotated(base, 2);

    check('no transform mutates its argument', JSON.stringify(base) === frozen,
        'one of withLink/withoutLink/symmetrised/rotated wrote through');

    check('withLink sets the requested cell', hasLink(withLink(emptyMatrix(), 2, 4), 2, 4));
    check('withLink sets only the requested cell', linkCount(withLink(emptyMatrix(), 2, 4)) === 1);
    check('withLink is one-directional', hasLink(withLink(emptyMatrix(), 2, 4), 4, 2) === false);
    check('withoutLink clears the requested cell',
        hasLink(withoutLink(withLink(emptyMatrix(), 2, 4), 2, 4), 2, 4) === false);
    check('withLink ignores out-of-range indices',
        linkCount(withLink(emptyMatrix(), 9, 0)) === 0);
}

// ── 4. symmetrised — the regression test for drawDistances.js:197-203 ─────────

{
    const one = withLink(emptyMatrix(), 2, 4);
    const before = JSON.stringify(one);
    const sym = symmetrised(one);

    check('symmetrised does NOT mutate its input', JSON.stringify(one) === before,
        'this is the drawDistances corruption bug');
    check('symmetrised mirrors i,j to j,i', hasLink(sym, 2, 4) && hasLink(sym, 4, 2));
    check('symmetrised leaves the original one-directional', hasLink(one, 4, 2) === false);

    const rng = makeRng(99);
    let idempotent = 0, mirrored = 0;
    for (let i = 0; i < 100; i++) {
        const m = randomMatrix(rng, 0.25);
        const s = symmetrised(m);
        if (eq(symmetrised(s), s)) idempotent++;
        let allMirrored = true;
        for (let a = 0; a < SIDES; a++) {
            for (let b = 0; b < SIDES; b++) if (s[a][b] !== s[b][a]) allMirrored = false;
        }
        if (allMirrored) mirrored++;
    }
    check('symmetrised is idempotent', idempotent === 100, `${idempotent}/100`);
    check('symmetrised output is symmetric', mirrored === 100, `${mirrored}/100`);

    check('symmetrised preserves self-loops',
        hasLink(symmetrised(withLink(emptyMatrix(), 3, 3)), 3, 3));
    check('symmetrised of empty is empty', linkCount(symmetrised(emptyMatrix())) === 0);
}

// ── 5. rotated — equivalence with tileCopyPasteWizard.js:371-380 ──────────────

/** Frozen verbatim copy of the wizard's nested rotateMatrix, as it stood before the move. */
function legacyRotateMatrix(mat, dir) {
    if (!Array.isArray(mat) || mat.length !== 6) return mat;
    const out = Array.from({ length: 6 }, () => Array(6).fill(0));
    for (let i = 0; i < 6; ++i) for (let j = 0; j < 6; ++j) {
        const ni = (i + dir + 6) % 6;
        const nj = (j + dir + 6) % 6;
        out[ni][nj] = mat[i][j];
    }
    return out;
}

{
    const rng = makeRng(31337);
    let agree = 0, total = 0;
    for (let i = 0; i < 60; i++) {
        const m = randomMatrix(rng, 0.3);
        // The legacy version only normalised dir over [-5, 5]; that is its whole usable range.
        for (let dir = -5; dir <= 5; dir++) {
            total++;
            if (eq(rotated(m, dir), legacyRotateMatrix(m, dir))) agree++;
        }
    }
    check('rotated matches the frozen wizard implementation', agree === total, `${agree}/${total}`);

    const rng2 = makeRng(42);
    const m = randomMatrix(rng2, 0.3);
    check('rotated by 6 is identity', eq(rotated(m, 6), m));
    check('rotated by 0 is identity', eq(rotated(m, 0), m));
    check('rotated composes', eq(rotated(rotated(m, 2), 4), m));
    check('rotated normalises negatives', eq(rotated(m, -1), rotated(m, 5)));
    check('rotated normalises beyond one turn', eq(rotated(m, 8), rotated(m, 2)));
    check('rotated preserves linkCount', linkCount(rotated(m, 3)) === linkCount(m));

    for (let s = 0; s < SIDES; s++) {
        for (let d = 1; d < SIDES; d++) {
            const r = rotated(withLink(emptyMatrix(), s, s), d);
            check(`self-loop on ${s} rotates by ${d} to ${(s + d) % SIDES}`,
                hasLink(r, (s + d) % SIDES, (s + d) % SIDES) && linkCount(r) === 1);
        }
    }
}

// ── 6. Segment enumeration ────────────────────────────────────────────────────

{
    check('segmentKey is order-independent for curves', segmentKey(2, 4) === segmentKey(4, 2));
    check('segmentKey distinguishes curves from loops', segmentKey(3, 3) !== segmentKey(3, 4));
    check('loop keys cannot collide with curve keys',
        [0, 1, 2, 3, 4, 5].every(s => segmentKey(s, s).startsWith('l')));

    // The drawnPairs invariant from hyperlanes.js:203 — a symmetric pair is ONE drawing.
    const symPair = symmetrised(withLink(emptyMatrix(), 2, 4));
    const segs = segments(symPair);
    check('a symmetric pair yields exactly one curve', segs.length === 1, `got ${segs.length}`);
    check('that curve is kind:curve', segs[0]?.kind === 'curve');
    check('that curve keeps both edge indices',
        segs[0] && ((segs[0].entry === 2 && segs[0].exit === 4) || (segs[0].entry === 4 && segs[0].exit === 2)));

    const oneWay = segments(withLink(emptyMatrix(), 2, 4));
    check('a one-directional link also yields one curve', oneWay.length === 1);

    const loop = segments(withLink(emptyMatrix(), 3, 3));
    check('a self-loop yields exactly one segment', loop.length === 1);
    check('a self-loop is kind:loop with entry === exit',
        loop[0]?.kind === 'loop' && loop[0].entry === loop[0].exit && loop[0].entry === 3);

    const full = Array.from({ length: SIDES }, () => Array(SIDES).fill(1));
    const all = segments(full);
    check('a full matrix yields 6 loops + 15 curves', all.length === 21, `got ${all.length}`);
    check('a full matrix yields exactly 6 loops',
        all.filter(s => s.kind === 'loop').length === 6);
    check('segment keys are unique', new Set(all.map(s => s.key)).size === all.length);

    check('segments of empty is empty', segments(emptyMatrix()).length === 0);
    check('segments tolerates null', segments(null).length === 0);

    // Symmetrising must never change what gets drawn.
    const rng = makeRng(555);
    let stable = 0;
    for (let i = 0; i < 100; i++) {
        const m = randomMatrix(rng, 0.2);
        if (segments(m).length === segments(symmetrised(m)).length) stable++;
    }
    check('symmetrising does not change the segment count', stable === 100, `${stable}/100`);
}

// ── 7. Direction and path resolution ──────────────────────────────────────────

/**
 * A centre hex 'C' at the origin with its six neighbours named by edge index, plus 'FAR',
 * which is adjacent to nothing.
 */
const coords = { C: { q: 0, r: 0 }, FAR: { q: 9, r: 9 } };
EDGE_DIRECTIONS.forEach((d, i) => { coords[`N${i}`] = { q: d.q, r: d.r }; });

{
    for (let i = 0; i < SIDES; i++) {
        check(`dirIndexBetween finds neighbour ${i}`, dirIndexBetween(coords.C, coords[`N${i}`]) === i);
        check(`areNeighbors accepts neighbour ${i}`, areNeighbors(coords.C, coords[`N${i}`]) === true);
    }
    check('dirIndexBetween returns -1 for a non-neighbour', dirIndexBetween(coords.C, coords.FAR) === -1);
    check('areNeighbors rejects a non-neighbour', areNeighbors(coords.C, coords.FAR) === false);
    check('a hex is not its own neighbour', areNeighbors(coords.C, coords.C) === false);
    check('dirIndexBetween is safe on null', dirIndexBetween(null, coords.C) === -1);

    // Direction is reciprocal: if B is on edge i of A, A is on edge oppositeSide(i) of B.
    for (let i = 0; i < SIDES; i++) {
        check(`direction ${i} is reciprocal`,
            dirIndexBetween(coords[`N${i}`], coords.C) === oppositeSide(i));
    }
}

// ── 8. resolveSegment — the A→B→C click rule ──────────────────────────────────

{
    // Enter from N0's side, leave toward N2.
    const seg = resolveSegment(coords, 'N0', 'C', 'N2');
    check('a valid path resolves to a curve', seg?.kind === 'curve');
    check('the curve is on the middle hex', seg?.via === 'C');
    check('entry is the edge facing where we came from', seg?.entry === 0);
    check('exit is the edge facing where we are going', seg?.exit === 2);

    // A === C: came in and went back out the same side.
    const loop = resolveSegment(coords, 'N3', 'C', 'N3');
    check('A === C resolves to a loop', loop?.kind === 'loop');
    check('a loop has entry === exit', loop && loop.entry === loop.exit && loop.entry === 3);

    check('a non-adjacent first label is rejected', resolveSegment(coords, 'FAR', 'C', 'N2') === null);
    check('a non-adjacent last label is rejected', resolveSegment(coords, 'N0', 'C', 'FAR') === null);
    check('a repeated A/B is rejected', resolveSegment(coords, 'C', 'C', 'N2') === null);
    check('a repeated B/C is rejected', resolveSegment(coords, 'N0', 'C', 'C') === null);
    check('an unknown label is rejected', resolveSegment(coords, 'NOPE', 'C', 'N2') === null);
    check('a missing coords record is rejected', resolveSegment(null, 'N0', 'C', 'N2') === null);

    // Every entry/exit pair a user can actually click must resolve.
    let resolved = 0;
    for (let a = 0; a < SIDES; a++) {
        for (let c = 0; c < SIDES; c++) {
            const s = resolveSegment(coords, `N${a}`, 'C', `N${c}`);
            if (s && s.entry === a && s.exit === (a === c ? a : c)) resolved++;
        }
    }
    check('all 36 clickable paths resolve correctly', resolved === 36, `${resolved}/36`);

    // Drawing a resolved segment and reading it back must agree.
    const drawn = withLink(emptyMatrix(), seg.entry, seg.exit);
    check('a resolved segment writes the cell it named', hasLink(drawn, 0, 2));
}

// ── 9. Geometry ───────────────────────────────────────────────────────────────

/** Frozen verbatim copy of draw/links.js:99-125, to pin the new loopArm against it. */
function legacyLoopback(center, entry, armLength = 14) {
    const start = (() => {
        const a1 = Math.PI / 180 * (60 * entry - 120);
        const a2 = Math.PI / 180 * (60 * (entry + 1) - 120);
        const x1 = center.x + 40 * Math.cos(a1), y1 = center.y + 40 * Math.sin(a1);
        const x2 = center.x + 40 * Math.cos(a2), y2 = center.y + 40 * Math.sin(a2);
        return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    })();
    const dx = center.x - start.x, dy = center.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const t = armLength / len;
    return { x1: start.x, y1: start.y, x2: center.x - dx * t, y2: center.y - dy * t };
}

{
    const c = { x: 100, y: 200 };

    // The whole point of LOOP_SCALE: appearance is unchanged at the default hex radius.
    check('loopCircleRadius(40) === 14', close(loopCircleRadius(40), 14),
        `got ${loopCircleRadius(40)}`);
    check('LOOP_SCALE is 14/40', close(LOOP_SCALE, 14 / 40));

    // At radius 40 the new arm must be pixel-identical to the old one.
    let identical = 0;
    for (let s = 0; s < SIDES; s++) {
        const a = loopArm(c, s, 40);
        const b = legacyLoopback(c, s);
        if (close(a.x1, b.x1, 1e-9) && close(a.y1, b.y1, 1e-9) &&
            close(a.x2, b.x2, 1e-9) && close(a.y2, b.y2, 1e-9)) identical++;
    }
    check('loopArm matches the frozen links.js at radius 40', identical === SIDES,
        `${identical}/${SIDES} sides identical`);

    // ...and at other radii it must NOT, because that is the bug being fixed.
    const scaled = loopArm(c, 0, 80);
    const legacyAt80 = legacyLoopback(c, 0);
    check('loopArm scales with radius (links.js:101 hardcoded 40)',
        !close(scaled.x1, legacyAt80.x1, 1e-6) || !close(scaled.y1, legacyAt80.y1, 1e-6));

    // The arm must land exactly on the circle it joins, at any radius.
    for (const r of [10, 40, 80, 137.5]) {
        for (let s = 0; s < SIDES; s++) {
            const arm = loopArm(c, s, r);
            check(`arm meets the circle perimeter (r=${r}, side ${s})`,
                close(Math.hypot(arm.x2 - c.x, arm.y2 - c.y), loopCircleRadius(r), 1e-9));
            check(`arm starts on the hex edge (r=${r}, side ${s})`,
                close(Math.hypot(arm.x1 - c.x, arm.y1 - c.y), r * Math.cos(Math.PI / 6), 1e-9));
        }
    }

    // edgeMid: six equidistant points, scaling linearly.
    const dists = Array.from({ length: SIDES }, (_, s) => {
        const p = edgeMid(c, s, 40);
        return Math.hypot(p.x - c.x, p.y - c.y);
    });
    check('all six edge midpoints are equidistant from the centre',
        dists.every(d => close(d, dists[0], 1e-9)), dists.map(d => d.toFixed(4)).join(' '));
    check('edge midpoint distance is the apothem',
        close(dists[0], 40 * Math.cos(Math.PI / 6), 1e-9));

    const p40 = edgeMid(c, 1, 40), p80 = edgeMid(c, 1, 80);
    check('edgeMid scales linearly in radius',
        close(p80.x - c.x, 2 * (p40.x - c.x), 1e-9) && close(p80.y - c.y, 2 * (p40.y - c.y), 1e-9));

    // curvePath: parseable and finite for every pair, at every radius.
    let wellFormed = 0, pairs = 0;
    for (const r of [40, 80]) {
        for (let a = 0; a < SIDES; a++) {
            for (let b = 0; b < SIDES; b++) {
                if (a === b) continue;
                pairs++;
                const d = curvePath(c, a, b, r);
                const nums = d.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g) || [];
                if (/^M[-\d.]/.test(d) && d.includes(' Q') && nums.length === 6 &&
                    nums.every(n => Number.isFinite(Number(n)))) wellFormed++;
            }
        }
    }
    check('curvePath emits a finite M/Q path for all 60 pairs', wellFormed === pairs,
        `${wellFormed}/${pairs}`);

    // The control point sits between the centre and the chord — that is what makes the
    // link bow rather than cut straight across.
    check('the curve pull changes the control point',
        curvePath(c, 0, 2, 40, 1) !== curvePath(c, 0, 2, 40, 0.25));

    // Opposite edges are the exception: their chord midpoint IS the centre, so the pull
    // has nothing to act on and the link is a straight line through the tile at any
    // setting. Worth pinning — it looks like a bug in a screenshot and is not one.
    for (const [a, b] of [[0, 3], [1, 4], [2, 5]]) {
        check(`opposite edges ${a}/${b} draw straight regardless of pull`,
            curvePath(c, a, b, 40, 1) === curvePath(c, a, b, 40, 0.25));
    }
}

// ── 10. The gesture store ─────────────────────────────────────────────────────

{
    store.__resetForTest();

    check('store starts empty and enabled',
        store.getPath().length === 0 && store.isEnabled() === true && store.isUnlinking() === false);
    check('getLastLabel is null on an empty path', store.getLastLabel() === null);

    store.pushLabel('A');
    store.pushLabel('B');
    check('pushLabel appends in order', eq(store.getPath(), ['A', 'B']));
    check('getLastLabel returns the newest', store.getLastLabel() === 'B');
    check('getPathLength tracks the path', store.getPathLength() === 2);

    // The store must never hand out its own array — that was the divergence bug.
    const handed = store.getPath();
    handed.push('LEAK');
    handed.length = 0;
    check('getPath returns a defensive copy', eq(store.getPath(), ['A', 'B']),
        `got ${JSON.stringify(store.getPath())}`);

    store.pushLabel('C');
    store.keepTail(2);
    check('keepTail keeps the newest n', eq(store.getPath(), ['B', 'C']));
    store.keepTail(9);
    check('keepTail is a no-op when the path is shorter', eq(store.getPath(), ['B', 'C']));

    store.setPath(['X', 'Y', 'Z']);
    check('setPath replaces the path', eq(store.getPath(), ['X', 'Y', 'Z']));
    store.setPath(null);
    check('setPath(null) empties the path', store.getPath().length === 0);

    // The `editor.selectedPath = []` idiom used by generateMap/setMode/right-click.
    store.setPath(['P']);
    store.setPath([]);
    check('setPath([]) clears, matching the editor assignment idiom', store.getPath().length === 0);

    store.setUnlinking(true);
    check('setUnlinking coerces to boolean', store.isUnlinking() === true);
    store.setEnabled(false);
    check('setEnabled coerces to boolean', store.isEnabled() === false);

    store.setPath(['Q', 'R']);
    store.reset();
    check('reset clears the path', store.getPath().length === 0);
    check('reset drops unlink mode', store.isUnlinking() === false);
    check('reset leaves `enabled` alone', store.isEnabled() === false,
        'right-click sets linking separately; reset must not fight it');

    // Subscriptions
    store.__resetForTest();
    let fired = 0;
    const unsub = store.subscribe(() => { fired++; });
    store.pushLabel('A');
    check('subscribe fires on change', fired === 1, `fired ${fired}`);
    store.setUnlinking(true);
    check('subscribe fires on modifier change', fired === 2, `fired ${fired}`);
    store.setUnlinking(true);
    check('a no-op write does not notify', fired === 2, `fired ${fired}`);
    unsub();
    store.pushLabel('B');
    check('unsubscribe stops notifications', fired === 2, `fired ${fired}`);

    // A listener that removes itself mid-notify must not corrupt the iteration.
    store.__resetForTest();
    let selfRemoved = 0, alsoFired = 0;
    const off = store.subscribe(() => { selfRemoved++; off(); });
    store.subscribe(() => { alsoFired++; });
    store.pushLabel('A');
    store.pushLabel('B');
    check('a self-unsubscribing listener fires once', selfRemoved === 1, `fired ${selfRemoved}`);
    check('other listeners still fire after one removes itself', alsoFired === 2, `fired ${alsoFired}`);

    store.__resetForTest();
    check('__resetForTest restores defaults',
        store.getPath().length === 0 && store.isEnabled() === true && store.isUnlinking() === false);
    let afterReset = 0;
    store.subscribe(() => { afterReset++; });
    store.__resetForTest();
    store.pushLabel('A');
    check('__resetForTest drops listeners', afterReset === 0, `fired ${afterReset}`);
    store.__resetForTest();
}

// ── 11. Indicator: which hex the next click writes to ────────────────────────

{
    // The rule that makes the indicator correct, and the one that was invisible in the UI:
    // with a path of [A, B] the next click writes to B, not to the hex being clicked.
    check('no active hex before two clicks', activeLabel([]) === null && activeLabel(['A']) === null);
    check('with [A,B] the next click writes to B', activeLabel(['A', 'B']) === 'B');
    check('the active hex is the head of the path', activeLabel(['A', 'B', 'C']) === 'C');

    // After a segment is drawn the path is trimmed to its last two, and the active hex must
    // follow — that continuation is what the old UI gave no sign of.
    const path = ['A', 'B', 'C'];
    const afterDraw = path.slice(-2);          // what keepTail(2) leaves
    check('after a draw the active hex moves to the new head',
        activeLabel(afterDraw) === 'C', `got ${activeLabel(afterDraw)}`);

    // And it agrees with what resolveSegment will actually pick as `via`.
    const seg = resolveSegment(coords, 'N0', 'C', 'N2');
    check('activeLabel agrees with resolveSegment.via',
        activeLabel(['N0', 'C']) === seg.via, `${activeLabel(['N0', 'C'])} vs ${seg.via}`);
}

// ── 12. hexCorners ────────────────────────────────────────────────────────────

{
    const c = { x: 50, y: 60 };
    const pts = hexCorners(c, 40).split(' ').map(p => p.split(',').map(Number));
    check('hexCorners emits six points', pts.length === 6, `got ${pts.length}`);
    check('every corner is finite', pts.every(p => p.length === 2 && p.every(Number.isFinite)));
    check('every corner is `radius` from the centre',
        pts.every(([x, y]) => close(Math.hypot(x - c.x, y - c.y), 40, 1e-9)));

    // Must trace the same hexagon drawHexes.js:59-62 draws, or the ring will be rotated
    // relative to the tile it is meant to outline.
    const legacy = Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * 60 * i;
        return `${c.x + 40 * Math.cos(a)},${c.y + 40 * Math.sin(a)}`;
    }).join(' ');
    check('hexCorners matches the polygon drawHexes.js draws', hexCorners(c, 40) === legacy);
}

// ── 13. Links are bidirectional wiring ───────────────────────────────────────
//
// Regression guard. Drawing used to write only matrix[entry][exit]; the old distance
// calculation then symmetrised the matrix IN PLACE, so the first Shift+D silently repaired
// it. That meant whether a map exported working hyperlanes depended on whether a distance
// calculation had been run first. Removing the in-place mutation removed the accidental
// repair, so the write itself has to be symmetric.

{
    // Mirrors setBothWays in hyperlaneEditing.js — kept in step by the assertions below.
    const setBothWays = (m, e, x, v) => { m[e][x] = v; m[x][e] = v; };

    const m = emptyMatrix();
    setBothWays(m, 5, 2, 1);
    check('drawing a link records both directions',
        hasLink(m, 5, 2) && hasLink(m, 2, 5), m.flat().join(''));
    check('a drawn link needs no symmetrising', eq(symmetrised(m), m),
        'if these differ, an export that symmetrises would change the drawn data');
    check('a drawn link is still ONE segment to draw', segments(m).length === 1,
        `got ${segments(m).length}`);

    setBothWays(m, 5, 2, 0);
    check('erasing a link clears both directions', linkCount(m) === 0, m.flat().join(''));

    // Self-loops are a single cell on the diagonal; mirroring is a no-op there.
    const loop = emptyMatrix();
    setBothWays(loop, 3, 3, 1);
    check('a self-loop is one cell', linkCount(loop) === 1);
    check('a self-loop needs no mirror', eq(symmetrised(loop), loop));

    // Legacy/imported one-way data must still export bidirectionally — that is what the
    // symmetrised() call at the exportMapInfo boundary is for.
    const legacy = withLink(emptyMatrix(), 5, 2);
    check('legacy one-way data is asymmetric as stored', !hasLink(legacy, 2, 5));
    check('symmetrised makes legacy data safe to export',
        hasLink(symmetrised(legacy), 5, 2) && hasLink(symmetrised(legacy), 2, 5));
    check('symmetrising legacy data does not change what is drawn',
        segments(legacy).length === segments(symmetrised(legacy)).length);
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\ntest-hyperlanes: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFailures:\n' + failures.map(f => `  ✗ ${f}`).join('\n') + '\n');
    process.exit(1);
}
