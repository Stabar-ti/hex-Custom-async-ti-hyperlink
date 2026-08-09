/**
 * Tests for hyperlane traversal in the distance calculation, run against the real
 * calculateDistancesFrom over synthetic maps.
 *
 *   node tools/test-distances.js      (or: npm test)
 *
 * The rule under test is the one the subsystem kept getting wrong:
 *
 *   A hyperlane is a CONDUIT, not a destination. It describes a path between two other
 *   tiles. It never takes a distance number of its own, and passing through it — however
 *   many hyperlanes are chained together — costs nothing.
 *
 * Two bugs here were invisible for a long time because nothing exercised them:
 *
 *   1. `isPassable` keyed off `baseType !== ''`. AsyncTI4 hyperlane TILES keep baseType ''
 *      (assignSystem returns before setting one) so they were rejected and traversed
 *      correctly by luck. Hand-drawn hyperlanes get baseType 'hyperlane', so they read as
 *      an ordinary sector, got stepped onto as a neighbour, and every tile beyond them came
 *      out one too far.
 *   2. The traversal used to symmetrise `hex.matrix` IN PLACE, so a read-only distance
 *      query permanently rewrote the user's drawn links.
 *
 * drawDistances.js has no DOM at module scope, so it imports straight into node and these
 * run against the real BFS rather than a reimplementation of it.
 */

import { calculateDistancesFrom } from '../src/draw/drawDistances.js';

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// edgeDirections, matching constants.js:25 — index 2 is east (+1,0), 5 is west (-1,0).
const edgeDirections = [
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
    { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
];
const EAST = 2, WEST = 5;

const emptyMatrix = () => Array.from({ length: 6 }, () => Array(6).fill(0));

/**
 * A straight west-to-east row of hexes named h0..hN.
 * `spec[i]` is either a sector type string (an ordinary tile) or {link: [entry, exit]}
 * for a hyperlane conduit, or {link: [...], baseType: '...'} for a hex that is both.
 */
function makeMap(spec) {
    const hexes = {};
    spec.forEach((s, i) => {
        const hex = {
            q: i, r: 0, matrix: emptyMatrix(), effects: new Set(),
            baseType: '', realId: null, borderAnomalies: {}
        };
        if (typeof s === 'string') {
            hex.baseType = s;
        } else {
            const [entry, exit] = s.link;
            // Links are bidirectional wiring — the draw path writes both cells.
            hex.matrix[entry][exit] = 1;
            hex.matrix[exit][entry] = 1;
            hex.baseType = s.baseType ?? 'hyperlane';   // what drawing leaves behind
        }
        hexes[`h${i}`] = hex;
    });
    return { hexes, edgeDirections, options: {} };
}

const dist = (editor, from, max = 6) => calculateDistancesFrom(editor, from, max) || {};

// ── 1. A single hyperlane between two systems ─────────────────────────────────

{
    // system — hyperlane — system
    const editor = makeMap(['1 planet', { link: [WEST, EAST] }, '1 planet']);
    const r = dist(editor, 'h0');

    check('the source is distance 0', r.h0 === 0, JSON.stringify(r));
    check('a hyperlane gets NO distance of its own', r.h1 === undefined,
        `h1 = ${r.h1} — it was stepped onto as an ordinary tile`);
    check('the tile beyond a hyperlane is distance 1', r.h2 === 1,
        `h2 = ${r.h2}, expected 1 (the hyperlane must cost nothing)`);
    check('a hyperlane never appears in the results', !Object.keys(r).includes('h1'));
}

// ── 2. Chained hyperlanes still cost one jump in total ────────────────────────

{
    const editor = makeMap([
        '1 planet', { link: [WEST, EAST] }, { link: [WEST, EAST] }, '1 planet', '1 planet'
    ]);
    const r = dist(editor, 'h0');

    check('neither tile of a 2-chain takes a distance',
        r.h1 === undefined && r.h2 === undefined, JSON.stringify(r));
    check('a 2-hyperlane chain still costs one jump', r.h3 === 1, `h3 = ${r.h3}`);
    check('the tile after that is 2', r.h4 === 2, `h4 = ${r.h4}`);
}

{
    // Three in a row — length of the chain must not matter at all.
    const editor = makeMap([
        '1 planet', { link: [WEST, EAST] }, { link: [WEST, EAST] }, { link: [WEST, EAST] }, '1 planet'
    ]);
    const r = dist(editor, 'h0');
    check('a 3-hyperlane chain also costs one jump', r.h4 === 1, `h4 = ${r.h4}`);
    check('no tile of a 3-chain takes a distance',
        r.h1 === undefined && r.h2 === undefined && r.h3 === undefined, JSON.stringify(r));
}

// ── 3. Traversal works in both directions ─────────────────────────────────────

{
    const editor = makeMap(['1 planet', { link: [WEST, EAST] }, '1 planet']);
    check('west to east', dist(editor, 'h0').h2 === 1);
    check('east to west', dist(editor, 'h2').h0 === 1);
}

{
    // Drawn from the other side: the stored cells are the same because links are symmetric.
    const editor = makeMap(['1 planet', { link: [EAST, WEST] }, '1 planet']);
    check('the direction a link was drawn in does not matter', dist(editor, 'h0').h2 === 1);
}

// ── 4. The AsyncTI4 tile case: a conduit with baseType '' ─────────────────────

{
    // assignSystem returns before assigning a baseType, so placed hyperlane tiles keep ''.
    const editor = makeMap(['1 planet', { link: [WEST, EAST], baseType: '' }, '1 planet']);
    const r = dist(editor, 'h0');
    check('a placed hyperlane tile is also a conduit', r.h1 === undefined, `h1 = ${r.h1}`);
    check('and it also costs nothing to cross', r.h2 === 1, `h2 = ${r.h2}`);
}

// ── 5. A hex that carries links but IS a real system stays a destination ──────

{
    const editor = makeMap(['1 planet', { link: [WEST, EAST], baseType: '2 planet' }, '1 planet']);
    const r = dist(editor, 'h0');
    check('a real system carrying links is still reachable', r.h1 === 1,
        `h1 = ${r.h1} — a system must not be treated as a conduit`);
    check('and the tile past it is one further', r.h2 === 2, `h2 = ${r.h2}`);
}

// ── 6. A hyperlane that leads nowhere connects nothing ────────────────────────

{
    // The link runs north/south, but its neighbours are east/west — so it joins nothing.
    const editor = makeMap(['1 planet', { link: [0, 3] }, '1 planet']);
    const r = dist(editor, 'h0');
    check('a hyperlane whose links face elsewhere connects nothing',
        r.h2 === undefined, `h2 = ${r.h2}, expected unreachable`);
    check('and it still takes no distance itself', r.h1 === undefined, `h1 = ${r.h1}`);
}

// ── 7. The read-only guarantee ────────────────────────────────────────────────

{
    const editor = makeMap(['1 planet', { link: [WEST, EAST] }, '1 planet']);
    // A deliberately one-way matrix, as an older save or import would supply.
    editor.hexes.h1.matrix = emptyMatrix();
    editor.hexes.h1.matrix[WEST][EAST] = 1;
    const before = JSON.stringify(editor.hexes.h1.matrix);

    const r = dist(editor, 'h0');

    check('a distance query does not mutate the matrix',
        JSON.stringify(editor.hexes.h1.matrix) === before,
        'the calculation used to symmetrise hex.matrix in place');
    check('one-way stored data is still traversed both ways', r.h2 === 1, `h2 = ${r.h2}`);
    check('...and in reverse too', dist(editor, 'h2').h0 === 1);
    check('still unmutated after a second, reversed query',
        JSON.stringify(editor.hexes.h1.matrix) === before);
}

// ── 8. Repeated queries are stable ────────────────────────────────────────────

{
    const editor = makeMap(['1 planet', { link: [WEST, EAST] }, { link: [WEST, EAST] }, '1 planet']);
    const runs = [dist(editor, 'h0').h3, dist(editor, 'h0').h3, dist(editor, 'h0').h3];
    check('repeating a query gives the same answer', new Set(runs).size === 1 && runs[0] === 1,
        JSON.stringify(runs));
}

// ── 9. Ordinary tiles are unaffected ──────────────────────────────────────────

{
    const editor = makeMap(['1 planet', '1 planet', '1 planet', '1 planet']);
    const r = dist(editor, 'h0');
    check('a plain row counts normally', r.h1 === 1 && r.h2 === 2 && r.h3 === 3, JSON.stringify(r));
}

{
    // Void still blocks, and a void hex is not a conduit.
    const editor = makeMap(['1 planet', 'void', '1 planet']);
    const r = dist(editor, 'h0');
    check('void still blocks movement', r.h2 === undefined, JSON.stringify(r));
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\ntest-distances: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFailures:\n' + failures.map(f => `  ✗ ${f}`).join('\n') + '\n');
    process.exit(1);
}
