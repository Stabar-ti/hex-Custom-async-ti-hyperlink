/**
 * Tests for the map distance engine (BFS + hyperlanes + border anomalies + rifts).
 *
 *   node tools/test-distances.js      (or: npm test)
 *
 * The engine is the worst kind of code to leave untested: it produces a number for
 * every hex, and a *wrong* number looks exactly as plausible as a right one. Nobody
 * eyeballing a Shift+D overlay can tell that a supernova should not have been
 * reachable. So the checks below are all of the form "this specific arrangement of
 * tiles yields this specific set of distances".
 *
 * The engine takes an `editor`, but only ever touches `editor.hexes`,
 * `editor.edgeDirections` and `editor.options` — no DOM — so a plain object is a
 * complete stand-in and this runs headless.
 *
 * Most of these started life as `knownBug()` pins recording the WRONG answer the
 * engine gave at the time, so that splitting it into src/distance/* could be
 * verified as a pure move before any behaviour changed. They are all plain
 * check()s now — every pinned bug has been fixed — but the comments still say
 * which defect each one guards against, because that is what makes it obvious
 * when a "harmless" change quietly reintroduces one.
 */

import { calculateDistancesFrom } from '../src/distance/index.js';
import {
    EDGE_DIRECTIONS, buildCoordIndex, neighborLabel, oppositeSide, sideBetween,
} from '../src/utils/hexGrid.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// ── fixture helpers ───────────────────────────────────────────────────────────

const emptyMatrix = () => Array.from({ length: 6 }, () => Array(6).fill(0));

/** A hex with the full shape the engine expects. `o` fills in the optional bits. */
function mkHex(label, q, r, o = {}) {
    const hex = {
        label, q, r,
        baseType: o.baseType ?? 'empty',
        effects: new Set(o.effects ?? []),
        wormholes: new Set(o.wormholes ?? []),
        matrix: o.matrix ?? emptyMatrix(),
    };
    if (o.borderAnomalies) hex.borderAnomalies = o.borderAnomalies;
    if (o.customAdjacents) hex.customAdjacents = o.customAdjacents;
    if (o.adjacencyOverrides) hex.adjacencyOverrides = o.adjacencyOverrides;
    if (o.isCorner) hex.isCorner = true;
    return hex;
}

/** The complete surface of `editor` that the engine reads. */
function makeEditor(hexList, options = {}) {
    return {
        hexes: Object.fromEntries(hexList.map(h => [h.label, h])),
        edgeDirections: EDGE_DIRECTIONS,
        options: {
            useSupernova: true, useAsteroid: true, useNebula: true, useRift: true,
            useCustomLinks: true, useBorderAnomalies: true,
            ...options,
        },
    };
}

/**
 * `n` hexes in a straight line along side 2 ({q:+1, r:0}), labelled A, B, C…
 * Side 2 of each points at the next; side 5 points back at the previous.
 */
function line(n, opts = {}) {
    return Array.from({ length: n }, (_, i) =>
        mkHex(String.fromCharCode(65 + i), i, 0, opts[String.fromCharCode(65 + i)] ?? {}));
}

const ba = type => ({ type });

/** Readable comparison of a distance result against an expected {label: dist} map. */
function sameMap(actual, expected) {
    const aKeys = Object.keys(actual).sort();
    const eKeys = Object.keys(expected).sort();
    const ok = aKeys.length === eKeys.length
        && aKeys.every((k, i) => k === eKeys[i] && actual[k] === expected[k]);
    return { ok, detail: ok ? '' : `expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}` };
}

function expectDistances(name, editor, source, maxDist, expected) {
    const got = calculateDistancesFrom(editor, source, maxDist);
    const { ok, detail } = sameMap(got, expected);
    check(name, ok, detail);
    return got;
}

// ─────────────────────────────────────────────────────────────────────────────
// §0  hexGrid primitives
// ─────────────────────────────────────────────────────────────────────────────

check('§0 opposite of every side round-trips',
    [0, 1, 2, 3, 4, 5].every(s => oppositeSide(oppositeSide(s)) === s));
check('§0 oppositeSide accepts string keys (borderAnomalies is a plain object)',
    oppositeSide('2') === 5, `got ${oppositeSide('2')}`);
check('§0 oppositeSide rejects nonsense', Number.isNaN(oppositeSide('x')) && Number.isNaN(oppositeSide(9)));
check('§0 sideBetween agrees with EDGE_DIRECTIONS',
    EDGE_DIRECTIONS.every((d, i) => sideBetween({ q: 0, r: 0 }, { q: d.q, r: d.r }) === i));
check('§0 sideBetween is undefined for non-neighbours',
    sideBetween({ q: 0, r: 0 }, { q: 3, r: 0 }) === undefined);

{
    // All four corner hexes carry q:null/r:null. A coordinate index must not
    // collapse them onto one key, and must not claim they sit anywhere.
    const corners = {
        TL: mkHex('TL', null, null, { isCorner: true }),
        TR: mkHex('TR', null, null, { isCorner: true }),
        BL: mkHex('BL', null, null, { isCorner: true }),
        BR: mkHex('BR', null, null, { isCorner: true }),
        '000': mkHex('000', 0, 0),
    };
    const idx = buildCoordIndex(corners);
    check('§0 buildCoordIndex omits coordinate-less corner hexes',
        idx.size === 1 && idx.get('0,0') === '000', `size ${idx.size}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  Straight line — layering and the max-distance cutoff
// ─────────────────────────────────────────────────────────────────────────────

expectDistances('§1 straight line of 5, maxDist 3', makeEditor(line(5)), 'A', 3,
    { A: 0, B: 1, C: 2, D: 3 });

expectDistances('§1 maxDist 1 stops immediately', makeEditor(line(5)), 'A', 1,
    { A: 0, B: 1 });

expectDistances('§1 from the middle it spreads both ways', makeEditor(line(5)), 'C', 1,
    { C: 0, B: 1, D: 1 });

check('§1 unassigned hexes (baseType "") are not traversable', (() => {
    const hexes = line(4);
    hexes[1].baseType = '';           // B is an empty slot
    const got = calculateDistancesFrom(makeEditor(hexes), 'A', 3);
    return got.B === undefined && got.C === undefined;
})());

// ─────────────────────────────────────────────────────────────────────────────
// §2  Spatial Tear — bidirectional, stored on both hexes
// ─────────────────────────────────────────────────────────────────────────────

/** Spatial Tear between two adjacent hexes, written the way the double-mode UI writes it. */
function tearBetween(hexes, aIdx, bIdx) {
    const side = sideBetween(hexes[aIdx], hexes[bIdx]);
    hexes[aIdx].borderAnomalies = { [side]: ba('SPATIALTEAR') };
    hexes[bIdx].borderAnomalies = { [oppositeSide(side)]: ba('SPATIALTEAR') };
}

{
    const hexes = line(5); tearBetween(hexes, 1, 2);   // tear on the B|C border
    expectDistances('§2 spatial tear blocks forward', makeEditor(hexes), 'A', 4, { A: 0, B: 1 });
}
{
    const hexes = line(5); tearBetween(hexes, 1, 2);
    expectDistances('§2 spatial tear blocks backward too', makeEditor(hexes), 'E', 4,
        { E: 0, D: 1, C: 2 });
}
{
    const hexes = line(5); tearBetween(hexes, 1, 2);
    expectDistances('§2 useBorderAnomalies:false ignores the tear',
        makeEditor(hexes, { useBorderAnomalies: false }), 'A', 4, { A: 0, B: 1, C: 2, D: 3, E: 4 });
}
{
    // Legacy maps store the display name rather than the ID; both must block.
    const hexes = line(4);
    hexes[1].borderAnomalies = { 2: ba('Spatial Tear') };
    hexes[2].borderAnomalies = { 5: ba('Spatial Tear') };
    expectDistances('§2 legacy display-name form still blocks', makeEditor(hexes), 'A', 3,
        { A: 0, B: 1 });
}
{
    // Decorative border types must not affect pathing.
    const hexes = line(4);
    hexes[1].borderAnomalies = { 2: ba('ARROW') };
    hexes[2].borderAnomalies = { 5: ba('COREBORDER') };
    expectDistances('§2 decorative border types do not block', makeEditor(hexes), 'A', 3,
        { A: 0, B: 1, C: 2, D: 3 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §3  Gravity Wave — one-way, stored on the primary hex only
// ─────────────────────────────────────────────────────────────────────────────

{
    // GW on B's side 2 (the B|C border) => you may leave B into C, but not enter B from C.
    const hexes = line(4);
    hexes[1].borderAnomalies = { 2: ba('GRAVITYWAVE') };
    expectDistances('§3 gravity wave lets you move out through the wave edge',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1, C: 2, D: 3 });
}
{
    const hexes = line(4);
    hexes[1].borderAnomalies = { 2: ba('GRAVITYWAVE') };
    expectDistances('§3 gravity wave blocks entry through the wave edge',
        makeEditor(hexes), 'D', 3, { D: 0, C: 1 });
}
{
    // The border-anomaly registry lets a user make Gravity Wave bidirectional
    // (borderAnomaliesUI "bidirectional" checkbox). The engine ignores that today.
    const hexes = line(4);
    hexes[1].borderAnomalies = { 2: ba('GRAVITYWAVE') };
    const got = calculateDistancesFrom(makeEditor(hexes), 'A', 3, {
        anomalyTypes: { GRAVITYWAVE: { blocks: true, bidirectional: true }, SPATIALTEAR: { blocks: true, bidirectional: true } },
    });
    check('§3 an injected bidirectional Gravity Wave also blocks outbound',
        got.C === undefined, `got ${JSON.stringify(got)}`);
}
{
    // The step path and the conduit-hop path must agree about Gravity Wave.
    // A ── HL1 ── HL2 ── B, with a GW on HL1's outbound side: one-way, so it
    // guards entry INTO HL1 from HL2's direction and must not stop A reaching B.
    const hexes = hyperlaneChain('');
    hexes[1].borderAnomalies = { 2: ba('GRAVITYWAVE') };
    expectDistances('§3 gravity wave is one-way on conduit hops too',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1 });

    const blocked = hyperlaneChain('');
    blocked[2].borderAnomalies = { 5: ba('GRAVITYWAVE') };   // guards entry into HL2
    expectDistances('§3 gravity wave still blocks entry on a conduit hop',
        makeEditor(blocked), 'A', 3, { A: 0 });
}
{
    // A spatial tear between two conduits blocks the chain in both directions.
    const hexes = hyperlaneChain('');
    hexes[1].borderAnomalies = { 2: ba('SPATIALTEAR') };
    hexes[2].borderAnomalies = { 5: ba('SPATIALTEAR') };
    expectDistances('§3 a spatial tear severs a conduit chain',
        makeEditor(hexes), 'A', 3, { A: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  Hyperlane chain — conduits cost no movement and get no number
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ── HL1 ── HL2 ── B  along side 2.
 * Each conduit wires its side-5 (inbound) edge to its side-2 (outbound) edge.
 */
function hyperlaneChain(conduitBaseType) {
    const wire = () => { const m = emptyMatrix(); m[5][2] = 1; return m; };
    return [
        mkHex('A', 0, 0),
        mkHex('HL1', 1, 0, { baseType: conduitBaseType, matrix: wire() }),
        mkHex('HL2', 2, 0, { baseType: conduitBaseType, matrix: wire() }),
        mkHex('B', 3, 0),
    ];
}

const importedChain = expectDistances(
    '§4 imported hyperlane chain (baseType "") is free to cross',
    makeEditor(hyperlaneChain('')), 'A', 3, { A: 0, B: 1 });

expectDistances('§4 hyperlane chain is crossable in reverse',
    makeEditor(hyperlaneChain('')), 'B', 3, { B: 0, A: 1 });

check('§4 conduit tiles never appear in the result',
    importedChain.HL1 === undefined && importedChain.HL2 === undefined);

// ─────────────────────────────────────────────────────────────────────────────
// §5  Drawn hyperlanes — same geometry, different baseType (bug #13)
// ─────────────────────────────────────────────────────────────────────────────

{
    // features/hyperlanes.js sets baseType 'hyperlane' on any hex you draw links
    // on. That used to make isPassable accept it, so the search stepped ONTO the
    // conduit — a step each, and a distance number on a tile that is not a system.
    const got = calculateDistancesFrom(makeEditor(hyperlaneChain('hyperlane')), 'A', 3);
    check('§5 a drawn hyperlane chain behaves exactly like an imported one',
        sameMap(got, importedChain).ok,
        `imported ${JSON.stringify(importedChain)}\n    drawn    ${JSON.stringify(got)}`);
    check('§5 drawn conduits get no distance of their own',
        got.HL1 === undefined && got.HL2 === undefined, JSON.stringify(got));
}
{
    // A hex that has BOTH a system and hyperlane wiring is a system, not a
    // conduit: you stop on it and it costs a step. The real conduit past it
    // (HL2) is still free, so B lands at 2 rather than 1.
    const hexes = hyperlaneChain('');
    hexes[1].baseType = '2 planet';
    expectDistances('§5 a wired hex that is also a system is an ordinary tile',
        makeEditor(hexes), 'A', 3, { A: 0, HL1: 1, B: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  Hyperlane self-loops chain to each other
// ─────────────────────────────────────────────────────────────────────────────

{
    // HL at (1,0) has self-loops on side 5 (towards A) and side 2 (towards C).
    // Entering from A on side 5 must chain through the loop and exit at side 2.
    const m = emptyMatrix(); m[5][5] = 1; m[2][2] = 1;
    const hexes = [
        mkHex('A', 0, 0),
        mkHex('HL', 1, 0, { baseType: '', matrix: m }),
        mkHex('C', 2, 0),
    ];
    expectDistances('§6 self-loop chaining links both looped sides',
        makeEditor(hexes), 'A', 3, { A: 0, C: 1 });
}
{
    // A conduit with a single self-loop and no other exit is a dead end.
    const m = emptyMatrix(); m[5][5] = 1;
    const hexes = [
        mkHex('A', 0, 0),
        mkHex('HL', 1, 0, { baseType: '', matrix: m }),
        mkHex('C', 2, 0),
    ];
    expectDistances('§6 a lone self-loop leads nowhere new', makeEditor(hexes), 'A', 3, { A: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  A distance query must not modify the map (bug #1)
// ─────────────────────────────────────────────────────────────────────────────

/** A ── HL ── B, with the conduit wired ONE WAY only (side 5 -> side 2). */
function oneWayConduit() {
    const m = emptyMatrix(); m[5][2] = 1;
    return [mkHex('A', 0, 0), mkHex('HL', 1, 0, { baseType: '', matrix: m }), mkHex('B', 2, 0)];
}

expectDistances('§7 one-way conduit is crossable forwards',
    makeEditor(oneWayConduit()), 'A', 3, { A: 0, B: 1 });

expectDistances('§7 one-way conduit is crossable backwards (matrices read symmetrically)',
    makeEditor(oneWayConduit()), 'B', 3, { B: 0, A: 1 });

{
    const hexes = oneWayConduit();
    const before = JSON.stringify(hexes[1].matrix);
    calculateDistancesFrom(makeEditor(hexes), 'A', 3);
    const after = JSON.stringify(hexes[1].matrix);
    check('§7 a read-only distance query must not rewrite hex.matrix',
        before === after, `before ${before}\n    after  ${after}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  Wormholes
// ─────────────────────────────────────────────────────────────────────────────

const wormholeMap = () => [
    mkHex('M', 0, 0, { wormholes: ['alpha'] }),
    mkHex('W', 5, 0, { wormholes: ['alpha'] }),
    mkHex('V', 0, 5, { wormholes: ['alpha'] }),
    mkHex('BETA', 9, 0, { wormholes: ['beta'] }),
];

expectDistances('§8 same-type wormholes are all mutually adjacent',
    makeEditor(wormholeMap()), 'M', 2, { M: 0, W: 1, V: 1 });

check('§8 a different wormhole type is not linked',
    calculateDistancesFrom(makeEditor(wormholeMap()), 'M', 2).BETA === undefined);

{
    const got = calculateDistancesFrom(makeEditor(wormholeMap(), { useWormholes: false }), 'M', 2);
    check('§8 useWormholes:false switches wormhole travel off',
        got.W === undefined && got.V === undefined, JSON.stringify(got));
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  A torn border must not also sever a coincident wormhole (bug #4)
// ─────────────────────────────────────────────────────────────────────────────

{
    // A and B are neighbours AND share an alpha wormhole. The tear closes the
    // physical border; wormhole adjacency is a separate thing and should survive.
    const hexes = [
        mkHex('A', 0, 0, { wormholes: ['alpha'] }),
        mkHex('B', 1, 0, { wormholes: ['alpha'] }),
    ];
    tearBetween(hexes, 0, 1);
    const got = calculateDistancesFrom(makeEditor(hexes), 'A', 3);
    check('§9 a spatial tear does not sever a coincident wormhole link',
        got.B === 1, JSON.stringify(got));
}
{
    // ...but with no wormhole to fall back on, the tear still blocks.
    const hexes = [mkHex('A', 0, 0), mkHex('B', 1, 0)];
    tearBetween(hexes, 0, 1);
    expectDistances('§9 a spatial tear with no alternate route still blocks',
        makeEditor(hexes), 'A', 3, { A: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §10  Gravity rifts
// ─────────────────────────────────────────────────────────────────────────────

{
    //  A   B  [R1 R2 R3]  C   D      — a 3-hex rift cluster reached at distance 2
    const hexes = line(7, {
        C: { effects: ['rift'] }, D: { effects: ['rift'] }, E: { effects: ['rift'] },
    });
    // rename for readability: C,D,E are the rifts; F,G follow
    expectDistances('§10 a rift cluster shares one distance and grants a free step out',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1, C: 2, D: 2, E: 2, F: 2, G: 3 });
}
{
    // Source sitting on a rift: everything shifts one closer.
    const hexes = line(5, { A: { effects: ['rift'] } });
    expectDistances('§10 a rift source grants +1 movement to everything',
        makeEditor(hexes), 'A', 2, { A: 0, B: 1, C: 1, D: 2 });
}
{
    const hexes = line(7, {
        C: { effects: ['rift'] }, D: { effects: ['rift'] }, E: { effects: ['rift'] },
    });
    expectDistances('§10 useRift:false makes rifts ordinary tiles',
        makeEditor(hexes, { useRift: false }), 'A', 3, { A: 0, B: 1, C: 2, D: 3 });
}
{
    // A tear on the way into the cluster must stop the flood.
    const hexes = line(6, { C: { effects: ['rift'] }, D: { effects: ['rift'] } });
    tearBetween(hexes, 1, 2);
    expectDistances('§10 a tear blocks entry into a rift cluster',
        makeEditor(hexes), 'A', 4, { A: 0, B: 1 });
}

// A rift recorded only as `baseType` must get the full rift treatment, exactly
// like the baseType-only supernova and nebula in §11. Every rift site used to
// test `effects` alone, so such a hex was walked as an ordinary tile: no cluster
// flood, no free step out, no source bonus.
{
    const byEffects = line(7, {
        C: { effects: ['rift'] }, D: { effects: ['rift'] }, E: { effects: ['rift'] },
    });
    const byBaseType = line(7, {
        C: { baseType: 'rift' }, D: { baseType: 'rift' }, E: { baseType: 'rift' },
    });
    const a = calculateDistancesFrom(makeEditor(byEffects), 'A', 3);
    const b = calculateDistancesFrom(makeEditor(byBaseType), 'A', 3);
    check('§10 a baseType-only rift cluster behaves like an effects one',
        sameMap(b, a).ok, `effects  ${JSON.stringify(a)}\n    baseType ${JSON.stringify(b)}`);
    check('§10 (explicit) the baseType-only cluster shares one distance and steps out free',
        b.C === 2 && b.D === 2 && b.E === 2 && b.F === 2 && b.G === 3, JSON.stringify(b));
}
{
    const hexes = line(5, { A: { baseType: 'rift' } });
    expectDistances('§10 a baseType-only rift source also grants +1 movement',
        makeEditor(hexes), 'A', 2, { A: 0, B: 1, C: 1, D: 2 });
}
{
    const hexes = line(7, {
        C: { baseType: 'rift' }, D: { baseType: 'rift' }, E: { baseType: 'rift' },
    });
    expectDistances('§10 useRift:false also switches off baseType-only rifts',
        makeEditor(hexes, { useRift: false }), 'A', 3, { A: 0, B: 1, C: 2, D: 3 });
}
{
    // Mixed cluster: one member by effects, one by baseType — the flood must
    // cross the boundary between the two representations.
    const hexes = line(6, { C: { effects: ['rift'] }, D: { baseType: 'rift' } });
    expectDistances('§10 a cluster mixing both representations floods as one',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1, C: 2, D: 2, E: 2, F: 3 });
}

// The rift's free step has to work through a conduit as well as onto an
// ordinary tile, INCLUDING when the rift sits exactly on the distance limit —
// otherwise a rift next to a hyperlane would be a dead end at the cutoff.
// `expandFromFloodedRifts` runs on every layer up to and including
// effectiveMaxDist, which is what makes this work; `riftOneStepOut` is a
// backstop that never has anything left to do (see riftRules.js).
{
    // A -> rift -> conduit -> system, with the rift AT the limit.
    const conduit = () => { const m = emptyMatrix(); m[5][2] = 1; m[2][5] = 1; return m; };
    const hexes = [
        mkHex('A', 0, 0),
        mkHex('R', 1, 0, { effects: ['rift'] }),
        mkHex('HL', 2, 0, { baseType: '', matrix: conduit() }),
        mkHex('C', 3, 0),
    ];
    expectDistances('§10 a rift at the limit still exits through a conduit',
        makeEditor(hexes), 'A', 1, { A: 0, R: 1, C: 1 });

    // Same shape one hex further out, so the rift lands on the limit at dist 2.
    const deeper = [
        mkHex('A', 0, 0),
        mkHex('X', 1, 0),
        mkHex('R', 2, 0, { effects: ['rift'] }),
        mkHex('HL', 3, 0, { baseType: '', matrix: conduit() }),
        mkHex('C', 4, 0),
    ];
    expectDistances('§10 ...and the same one layer deeper, still at the limit',
        makeEditor(deeper), 'A', 2, { A: 0, X: 1, R: 2, C: 2 });

    // The conduit route must cost exactly what the plain route costs.
    const plain = [
        mkHex('A', 0, 0),
        mkHex('R', 1, 0, { effects: ['rift'] }),
        mkHex('C', 2, 0),
    ];
    const viaConduit = calculateDistancesFrom(makeEditor(hexes), 'A', 1);
    const viaPlain = calculateDistancesFrom(makeEditor(plain), 'A', 1);
    check('§10 a conduit costs a rift exit nothing extra',
        viaConduit.C === viaPlain.C && viaConduit.C === 1,
        `conduit ${JSON.stringify(viaConduit)}  plain ${JSON.stringify(viaPlain)}`);
}
{
    // A rift reached THROUGH a conduit, exiting through a second one.
    const conduit = () => { const m = emptyMatrix(); m[5][2] = 1; m[2][5] = 1; return m; };
    const hexes = [
        mkHex('A', 0, 0),
        mkHex('HL1', 1, 0, { baseType: '', matrix: conduit() }),
        mkHex('R', 2, 0, { effects: ['rift'] }),
        mkHex('HL2', 3, 0, { baseType: '', matrix: conduit() }),
        mkHex('C', 4, 0),
    ];
    expectDistances('§10 a rift reached via a conduit exits through another',
        makeEditor(hexes), 'A', 1, { A: 0, R: 1, C: 1 });
}
{
    // Source on a rift, straight into a conduit.
    const conduit = () => { const m = emptyMatrix(); m[5][2] = 1; m[2][5] = 1; return m; };
    const hexes = [
        mkHex('A', 0, 0, { effects: ['rift'] }),
        mkHex('HL', 1, 0, { baseType: '', matrix: conduit() }),
        mkHex('C', 2, 0),
    ];
    expectDistances('§10 a rift source exits through a conduit',
        makeEditor(hexes), 'A', 1, { A: 0, C: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §11  Anomalies: supernova, asteroid, nebula — effects vs baseType
// ─────────────────────────────────────────────────────────────────────────────

{
    // A supernova two hexes out is correctly unreachable...
    const hexes = line(4, { C: { baseType: 'supernova', effects: ['supernova'] } });
    expectDistances('§11 a supernova further out is not enterable',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1 });
}
{
    // ...and so is one directly adjacent to the source. isPassable used to be
    // handed the SOURCE hex's isSource flag while testing the NEIGHBOUR, which
    // let anomalies on the first layer through.
    const hexes = line(3, { B: { baseType: 'supernova', effects: ['supernova'] } });
    expectDistances('§11 a supernova adjacent to the source is not enterable either',
        makeEditor(hexes), 'A', 3, { A: 0 });
}
{
    // A source sitting ON a supernova can still move off it.
    const hexes = line(3, { A: { baseType: 'supernova', effects: ['supernova'] } });
    expectDistances('§11 a fleet already on a supernova can leave',
        makeEditor(hexes), 'A', 2, { A: 0, B: 1, C: 2 });
}
{
    const hexes = line(4, { C: { baseType: 'asteroid', effects: ['asteroid'] } });
    expectDistances('§11 an asteroid field is not enterable',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1 });
    const hexes2 = line(4, { C: { baseType: 'asteroid', effects: ['asteroid'] } });
    expectDistances('§11 useAsteroid:false makes it an ordinary tile',
        makeEditor(hexes2, { useAsteroid: false }), 'A', 3, { A: 0, B: 1, C: 2, D: 3 });
}
{
    // Anomaly recorded only as baseType, with no matching `effects` entry.
    const hexes = line(4, { C: { baseType: 'supernova' } });
    expectDistances('§11 a baseType-only supernova is as impassable as an effects one',
        makeEditor(hexes), 'A', 3, { A: 0, B: 1 });
}
{
    const hexes = line(5, { C: { baseType: 'nebula', effects: ['nebula'] } });
    expectDistances('§11 a nebula can be entered but not left',
        makeEditor(hexes), 'A', 4, { A: 0, B: 1, C: 2 });
}
{
    const hexes = line(5, { C: { baseType: 'nebula' } });
    expectDistances('§11 a baseType-only nebula also blocks movement out',
        makeEditor(hexes), 'A', 4, { A: 0, B: 1, C: 2 });
}
{
    const hexes = line(4, { B: { baseType: 'nebula', effects: ['nebula'] } });
    expectDistances('§11 a fleet already in a nebula can leave',
        makeEditor(hexes), 'B', 2, { B: 0, A: 1, C: 1, D: 2 });
}
{
    const hexes = line(4, { C: { baseType: 'void' } });
    expectDistances('§11 void blocks both ways', makeEditor(hexes), 'A', 3, { A: 0, B: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// §12  Corner hexes have no coordinates and must not fake adjacency (bug #2)
// ─────────────────────────────────────────────────────────────────────────────

{
    // Source sits far from the origin. A corner tile is reachable by wormhole.
    // The corner's q/r are null, so `null + dir.q` evaluates to `dir.q` and the
    // corner looks adjacent to the six hexes ringing (0,0).
    const ring = EDGE_DIRECTIONS.map((d, i) => mkHex(`N${i}`, d.q, d.r));
    const hexes = [
        mkHex('M', 5, 0, { wormholes: ['alpha'] }),
        mkHex('TL', null, null, { isCorner: true, wormholes: ['alpha'] }),
        mkHex('000', 0, 0),
        ...ring,
    ];
    const got = calculateDistancesFrom(makeEditor(hexes), 'M', 2);

    check('§12 the corner tile is reachable through its wormhole', got.TL === 1, JSON.stringify(got));
    check('§12 a coordinate-less corner does not neighbour the middle of the map',
        ring.every(h => got[h.label] === undefined),
        `leaked ${JSON.stringify(ring.map(h => h.label).filter(l => got[l] !== undefined))}`);
}
{
    // Two corners, each with a wormhole of a different type. They must stay distinct.
    const hexes = [
        mkHex('M', 5, 0, { wormholes: ['alpha', 'beta'] }),
        mkHex('TL', null, null, { isCorner: true, wormholes: ['alpha'] }),
        mkHex('BR', null, null, { isCorner: true, wormholes: ['beta'] }),
    ];
    const got = calculateDistancesFrom(makeEditor(hexes), 'M', 2);
    check('§12 several corner hexes stay individually addressable',
        got.TL === 1 && got.BR === 1, JSON.stringify(got));
}

// ─────────────────────────────────────────────────────────────────────────────
// §13  Custom links and adjacency overrides
// ─────────────────────────────────────────────────────────────────────────────

const FAR = 9;   // far enough that nothing is accidentally axially adjacent

{
    const hexes = [mkHex('A', 0, 0, { customAdjacents: { B: { twoWay: false } } }), mkHex('B', FAR, 0)];
    expectDistances('§13 a one-way custom link works forwards',
        makeEditor(hexes), 'A', 2, { A: 0, B: 1 });
}
{
    const hexes = [mkHex('A', 0, 0, { customAdjacents: { B: { twoWay: false } } }), mkHex('B', FAR, 0)];
    expectDistances('§13 a one-way custom link does not work backwards',
        makeEditor(hexes), 'B', 2, { B: 0 });
}
{
    const hexes = [
        mkHex('A', 0, 0, { customAdjacents: { B: { twoWay: true } } }),
        mkHex('B', FAR, 0, { customAdjacents: { A: { twoWay: true } } }),
    ];
    expectDistances('§13 a two-way custom link works both ways',
        makeEditor(hexes), 'B', 2, { B: 0, A: 1 });
}
{
    // Drawing A->B and B->A as two separate one-way links: each side sees a
    // reciprocal entry and the guard clause drops BOTH edges.
    const mk = () => [
        mkHex('A', 0, 0, { customAdjacents: { B: { twoWay: false } } }),
        mkHex('B', FAR, 0, { customAdjacents: { A: { twoWay: false } } }),
    ];
    const fwd = calculateDistancesFrom(makeEditor(mk()), 'A', 2);
    const rev = calculateDistancesFrom(makeEditor(mk()), 'B', 2);
    check('§13 two opposing one-way links are both traversable',
        fwd.B === 1 && rev.A === 1, `A->${JSON.stringify(fwd)}  B->${JSON.stringify(rev)}`);
}
{
    const hexes = [mkHex('A', 0, 0, { customAdjacents: { B: { twoWay: true } } }), mkHex('B', FAR, 0)];
    expectDistances('§13 useCustomLinks:false switches custom links off',
        makeEditor(hexes, { useCustomLinks: false }), 'A', 2, { A: 0 });
}
{
    // A link pointing at a hex that no longer exists (e.g. after a ring shrink).
    const hexes = [mkHex('A', 0, 0, { customAdjacents: { GONE: { twoWay: false } } })];
    let threw = null;
    try { calculateDistancesFrom(makeEditor(hexes), 'A', 2); } catch (e) { threw = e; }
    check('§13 a custom link to a deleted hex does not throw',
        threw === null, threw && String(threw.message));
}
{
    const hexes = [mkHex('A', 0, 0, { adjacencyOverrides: { 2: 'B' } }), mkHex('B', FAR, 0)];
    expectDistances('§13 an adjacency override links two distant hexes',
        makeEditor(hexes), 'A', 2, { A: 0, B: 1 });
}
{
    const hexes = [mkHex('A', 0, 0, { adjacencyOverrides: { 2: 'B' } }), mkHex('B', FAR, 0)];
    const got = calculateDistancesFrom(makeEditor(hexes, { useAdjacencyOverrides: false }), 'A', 2);
    check('§13 useAdjacencyOverrides:false switches overrides off',
        got.B === undefined, JSON.stringify(got));
}
{
    const hexes = [mkHex('A', 0, 0, { adjacencyOverrides: { 2: 'MISSING' } })];
    let threw = null;
    try { calculateDistancesFrom(makeEditor(hexes), 'A', 2); } catch (e) { threw = e; }
    check('§13 an adjacency override to a deleted hex is ignored, not fatal', threw === null,
        threw && String(threw.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// §14  hexGrid vs the inline implementations it replaced
//
// The 6-entry direction table was copy-pasted into ~10 files, each with its own
// neighbour lookup. Those call sites now go through utils/hexGrid.js. Below are
// verbatim copies of the implementations that were deleted, asserted to agree
// with the shared helpers across every hex of a 3-ring map and all 6 sides.
// ─────────────────────────────────────────────────────────────────────────────

{
    // Verbatim from the old HexEditor.clearCustomAdjacenciesBothSides /
    // borderAnomaliesDraw.getNeighborHex / export.getNeighborHexLabel.
    const legacyDirs = [
        { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
        { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
    ];
    const legacyNeighborLabel = (hexes, label, side) => {
        const hex = hexes[label];
        if (!hex) return null;
        const nq = hex.q + legacyDirs[side].q, nr = hex.r + legacyDirs[side].r;
        for (const [lab, h] of Object.entries(hexes)) {
            if (h.q === nq && h.r === nr) return lab;
        }
        return null;
    };
    const legacySideBetween = (hexes, a, b) => {
        const dq = hexes[b].q - hexes[a].q;
        const dr = hexes[b].r - hexes[a].r;
        for (let i = 0; i < 6; ++i) {
            if (legacyDirs[i].q === dq && legacyDirs[i].r === dr) return i;
        }
        return undefined;
    };
    const legacyOpposite = side => (parseInt(side, 10) + 3) % 6;

    check('§14 direction table is unchanged',
        JSON.stringify(EDGE_DIRECTIONS) === JSON.stringify(legacyDirs),
        JSON.stringify(EDGE_DIRECTIONS));

    // A dense patch of map: origin plus two full rings, so every side of the
    // inner hexes resolves and the outer ones have missing neighbours.
    const patch = [];
    for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
            if (Math.abs(q + r) > 2) continue;
            patch.push(mkHex(`h${q}_${r}`, q, r));
        }
    }
    const hexes = Object.fromEntries(patch.map(h => [h.label, h]));
    const idx = buildCoordIndex(hexes);

    let labelMismatch = null, sideMismatch = null, oppMismatch = null;
    for (const hex of patch) {
        for (let side = 0; side < 6; side++) {
            const a = neighborLabel(idx, hex, side);
            const b = legacyNeighborLabel(hexes, hex.label, side);
            if (a !== b) labelMismatch ??= `${hex.label} side ${side}: ${a} vs ${b}`;

            if (oppositeSide(side) !== legacyOpposite(side)) oppMismatch ??= `side ${side}`;
            if (oppositeSide(String(side)) !== legacyOpposite(String(side))) oppMismatch ??= `side "${side}"`;

            if (!b) continue;
            const s1 = sideBetween(hex, hexes[b]);
            const s2 = legacySideBetween(hexes, hex.label, b);
            if (s1 !== s2) sideMismatch ??= `${hex.label}->${b}: ${s1} vs ${s2}`;
        }
    }
    check('§14 neighborLabel matches the old linear scan', labelMismatch === null, labelMismatch);
    check('§14 sideBetween matches the old inline loop', sideMismatch === null, sideMismatch);
    check('§14 oppositeSide matches the old (side+3)%6', oppMismatch === null, oppMismatch);

    // The old scans compared `h.q === nq` against corner hexes with q === null,
    // which is false — so corners were skipped by accident. buildCoordIndex
    // skips them deliberately; the observable result must be the same.
    const withCorners = { ...hexes, TL: mkHex('TL', null, null, { isCorner: true }) };
    const idx2 = buildCoordIndex(withCorners);
    let cornerMismatch = null;
    for (const hex of patch) {
        for (let side = 0; side < 6; side++) {
            const a = neighborLabel(idx2, hex, side);
            const b = legacyNeighborLabel(withCorners, hex.label, side);
            if (a !== b) cornerMismatch ??= `${hex.label} side ${side}: ${a} vs ${b}`;
        }
    }
    check('§14 corner hexes are skipped the same way either route',
        cornerMismatch === null, cornerMismatch);
    check('§14 a corner hex has no neighbours at all',
        [0, 1, 2, 3, 4, 5].every(s => neighborLabel(idx2, withCorners.TL, s) === null));
}

// ─────────────────────────────────────────────────────────────────────────────
// §15  Cases carried over from the hyperlane-refactor's own test-distances.js
// ─────────────────────────────────────────────────────────────────────────────

{
    // A conduit whose wiring faces the wrong way joins nothing. The link runs
    // north/south (sides 0 and 3) while its neighbours sit east/west.
    const m = emptyMatrix(); m[0][3] = 1; m[3][0] = 1;
    const hexes = [
        mkHex('A', 0, 0),
        mkHex('HL', 1, 0, { baseType: '', matrix: m }),
        mkHex('C', 2, 0),
    ];
    expectDistances('§15 a conduit whose links face elsewhere connects nothing',
        makeEditor(hexes), 'A', 3, { A: 0 });
}
{
    // Guards the per-query caches in mapIndex: hoisting `matrixOf`'s memo or the
    // coordinate index to module scope would make the second answer differ.
    const build = () => makeEditor(hyperlaneChain(''));
    const shared = build();
    const runs = [
        calculateDistancesFrom(shared, 'A', 3),
        calculateDistancesFrom(shared, 'A', 3),
        calculateDistancesFrom(shared, 'A', 3),
    ].map(r => JSON.stringify(r));
    check('§15 repeating a query on one editor gives the same answer',
        new Set(runs).size === 1, runs.join(' | '));

    // ...including after an intervening query from somewhere else.
    calculateDistancesFrom(shared, 'B', 3);
    check('§15 an unrelated query in between changes nothing',
        JSON.stringify(calculateDistancesFrom(shared, 'A', 3)) === runs[0]);
}
{
    // The read-only guarantee again, but across two queries in opposite directions.
    const hexes = oneWayConduit();
    const editor = makeEditor(hexes);
    const before = JSON.stringify(hexes[1].matrix);
    calculateDistancesFrom(editor, 'A', 3);
    calculateDistancesFrom(editor, 'B', 3);
    check('§15 still unmutated after a second, reversed query',
        JSON.stringify(hexes[1].matrix) === before,
        `before ${before}\n    after  ${JSON.stringify(hexes[1].matrix)}`);
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\ndistances: ${passed}/${total} checks passed, ${failures.length} failed`);

if (failures.length) {
    console.error('\nFAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
