/**
 * Tests for the AutoMapper's fill engine, run against the real modules and the real
 * public/data/SystemInfo.json.
 *
 *   node tools/test-automapper.js      (or: npm test)
 *
 * Every block below is a bug that shipped. The engine is the kind of code where a wrong
 * answer still looks plausible — a map comes out full either way — so "it produced a map"
 * is not a check. What is checkable is the set of invariants the engine claims to hold:
 * a tile is used once, a tile the picker hides is never placed, a restricted hex only
 * takes its own type, and the analysis describes the pool the fill actually drains.
 *
 * autoBuilderCore.js imports cleanly under node — no DOM — so it goes straight in.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    fillRemaining, analyzeMap, getAvailableSystems, classifySystem, resolveRequirement
} from '../src/modules/automapper/autoBuilderCore.js';
import { isWeirdTile, hasFactionHomeworld, sourceGroupOf, defaultFilter } from '../src/modules/SystemPicker/pickerModel.js';
import * as pickerStore from '../src/modules/SystemPicker/pickerState.js';

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const systems = JSON.parse(
    readFileSync(join(here, '..', 'public', 'data', 'SystemInfo.json'), 'utf8')
).systems;

check('SystemInfo.json loaded', Array.isArray(systems) && systems.length > 600,
    `got ${systems?.length}`);

const byId = new Map(systems.map(s => [String(s.id), s]));

// ── helpers ───────────────────────────────────────────────────────────────────

/** A minimal editor: hexes painted with `baseType`, plus a system pool. */
function makeEditor(specs, allSystems = systems) {
    const hexes = {};
    specs.forEach((spec, i) => {
        const { label = `1${String(i).padStart(2, '0')}`, baseType, effects = [], valueTarget = null, realId = null } = spec;
        hexes[label] = {
            label, q: i, r: -i, baseType,
            effects: new Set(effects),
            valueTarget, realId,
        };
    });
    return { hexes, allSystems };
}

const repeat = (n, spec) => Array.from({ length: n }, () => ({ ...spec }));
const ids = result => result.assignments.map(a => String(a.sys.id));

// A tiny synthetic pool, so exhaustion cases are reachable without draining 671 systems.
const mkSys = (id, planetCount, extra = {}) => ({
    id, name: `sys ${id}`, source: 'base', tileBack: 'blue',
    planets: Array.from({ length: planetCount }, (_, i) => ({
        name: `p${id}${i}`, resources: 2, influence: 1, planetType: 'INDUSTRIAL',
    })),
    ...extra,
});

// ── 1. A system is never placed on two hexes ──────────────────────────────────
//
// The engine used to keep a flat-mapped `anyPool` beside the real buckets — a separate
// array over the same object references — so a system spliced out of one survived in the
// other. Six hexes wanting a type only two systems satisfy is the shape that triggered it.

{
    const pool = [
        mkSys('T1', 3), mkSys('T2', 3),
        mkSys('D1', 2), mkSys('D2', 2),
        mkSys('E1', 0), mkSys('E2', 0),
    ];
    const editor = makeEditor(repeat(6, { baseType: '3 planet' }), pool);
    const result = fillRemaining(editor, { sources: { base: true } });
    const placed = ids(result);

    check('exhausted pool places 6 distinct tiles',
        new Set(placed).size === placed.length,
        `placed ${placed.join(', ')}`);
    check('exhausted pool uses every available system', placed.length === 6,
        `placed ${placed.length}`);
}

// Same check against the real data on a large map — the realistic path.
{
    const editor = makeEditor([
        ...repeat(12, { baseType: '3 planet' }),
        ...repeat(18, { baseType: '2 planet' }),
        ...repeat(12, { baseType: '1 planet' }),
        ...repeat(10, { baseType: 'empty' }),
        ...repeat(6, { baseType: 'special', effects: ['nebula'] }),
    ]);
    const placed = ids(fillRemaining(editor, {}));
    check('58-hex fill places no tile twice',
        new Set(placed).size === placed.length,
        `${placed.length} placed, ${new Set(placed).size} distinct`);
}

// ── 2. "Duplicate empty/anomaly systems" repeats only after exhausting variety ─
//
// The option's label promises the same no-planet system may be placed more than once. A
// `seen` set put each id in the pool exactly once, so it never could. The first fix
// over-corrected: leaving the system in its bucket meant chooseIndex handed back the same
// index every call, so one tile filled every hex even with two dozen alternatives free.
// Repeats are for exhaustion — spend every distinct tile first.

{
    const onlyEmpty = [mkSys('E1', 0)];
    const editor = makeEditor(repeat(5, { baseType: 'empty' }), onlyEmpty);

    const off = fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: false });
    check('duplicates OFF: one empty system fills one hex', off.assignments.length === 1,
        `filled ${off.assignments.length}`);
    check('duplicates OFF: the rest are unmatched', off.unmatched.length === 4,
        `unmatched ${off.unmatched.length}`);

    const on = fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: true });
    check('duplicates ON: one empty system fills all 5 hexes', on.assignments.length === 5,
        `filled ${on.assignments.length}`);
    check('duplicates ON: with only one tile available it is the one used',
        new Set(ids(on)).size === 1, ids(on).join(', '));
}

// Plenty of variety available: repeats must not kick in at all.
{
    const editor = makeEditor(repeat(5, { baseType: 'empty' }));
    const on = fillRemaining(editor, { allowDuplicatesNoPlanet: true });
    check('duplicates ON does not repeat while distinct tiles remain',
        new Set(ids(on)).size === 5, ids(on).join(', '));
}

// Demand exceeds supply: every distinct tile is spent before any is reused.
{
    const pool = [mkSys('E1', 0), mkSys('E2', 0), mkSys('E3', 0)];
    const editor = makeEditor(repeat(9, { baseType: 'empty' }), pool);
    const placed = ids(fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: true }));
    const counts = placed.reduce((a, id) => (a[id] = (a[id] || 0) + 1, a), {});
    check('9 hexes from 3 tiles fills every hex', placed.length === 9, `filled ${placed.length}`);
    check('all 3 distinct tiles are used', Object.keys(counts).length === 3, JSON.stringify(counts));
    check('reuse is spread evenly, not concentrated on one tile',
        Object.values(counts).every(n => n === 3), JSON.stringify(counts));
}

// Anomaly hexes are the other half of "empty/anomaly" and were left out entirely.
{
    const editor = makeEditor(repeat(8, { baseType: 'special', effects: ['nebula'] }));

    const off = fillRemaining(editor, { allowDuplicatesNoPlanet: false });
    const on = fillRemaining(editor, { allowDuplicatesNoPlanet: true });

    check('duplicates ON fills anomaly hexes without token fallbacks',
        on.tokenPlacements.length === 0,
        `${on.tokenPlacements.length} token placements (off: ${off.tokenPlacements.length})`);
    check('duplicates ON fills anomaly hexes without downgrades',
        on.downgrades.length === 0, JSON.stringify(on.downgrades.slice(0, 2)));
    check('every anomaly hex gets a real nebula tile', on.assignments.length === 8,
        `filled ${on.assignments.length}`);
    check('and they really are nebula systems',
        on.assignments.every(a => byId.get(String(a.sys.id))?.isNebula),
        on.assignments.map(a => a.sys.id).join(', '));

    const analysis = analyzeMap(editor, { allowDuplicatesNoPlanet: true });
    const row = analysis.requirements.find(q => q.key === 'special|nebula');
    check('breakdown marks a repeatable anomaly pool as OK', row?.ok, JSON.stringify(row));
    check('breakdown flags it as repeatable so the UI can say "reused"',
        row?.repeatable === true, JSON.stringify(row));
}

// Planet-bearing systems must never repeat, even with the option on.
{
    const pool = [mkSys('P1', 2), mkSys('E1', 0)];
    const editor = makeEditor(repeat(4, { baseType: '2 planet' }), pool);
    const placed = ids(fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: true }));
    const planetPlacements = placed.filter(id => id === 'P1');
    check('duplicates ON never repeats a planet system', planetPlacements.length === 1,
        `P1 placed ${planetPlacements.length}×`);
}

// ── 3. Source choices narrow the picker filter, they never replace it ─────────
//
// Ticking a source used to skip passesAutoMapperFilters entirely — the only thing hiding
// FOW placeholders, blank draft tiles and faction homeworlds.

{
    const editor = makeEditor(repeat(10, { baseType: 'empty' }));
    const placed = ids(fillRemaining(editor, { sources: { other: true } }));
    const weird = placed.filter(id => isWeirdTile(byId.get(id) || {}));
    check('sources={other} places no weird/FOW/blank tiles', weird.length === 0,
        `got ${weird.join(', ')}`);
    check('sources={other} still fills the map', placed.length === 10, `filled ${placed.length}`);
}

{
    const editor = makeEditor(repeat(8, { baseType: '2 planet' }));
    const placed = ids(fillRemaining(editor, { sources: { te: true } }));
    const homeworlds = placed.filter(id => hasFactionHomeworld(byId.get(id) || {}));
    check('sources={te} places no faction homeworlds', homeworlds.length === 0,
        `got ${homeworlds.join(', ')}`);
}

// Grouping is delegated to the picker so the two can't disagree about where a source
// lives. The hand-rolled mapping this replaced tested for a 'codex' source that the data
// spells 'codex3' — it matched nothing, and named a group the picker doesn't have.
// The contract is not "codex3 is PoK", it is "codex3 is wherever the picker puts it".
{
    const editor = makeEditor([{ baseType: 'empty' }]);
    const everySource = [...new Set(systems.map(s => (s.source || '').toLowerCase()))].filter(Boolean);

    const orphans = everySource.filter(src => {
        const sample = systems.find(s => (s.source || '').toLowerCase() === src);
        const group = sourceGroupOf(sample);
        return !group || !getAvailableSystems(editor, { sources: { [group]: true } });
    });
    check('every source string maps to a real group', orphans.length === 0, orphans.join(', '));

    // codex3 specifically: the replaced code tested for a source named 'codex', which
    // matched nothing and named a group that does not exist. It now groups wherever the
    // picker groups it. (All three codex3 tiles happen to be Keleres homeworlds, so they
    // are excluded on faction grounds regardless of source — see the HS block below.)
    const codex = systems.filter(s => (s.source || '').toLowerCase() === 'codex3');
    check('data still has codex3 systems', codex.length > 0, `found ${codex.length}`);
    check('codex3 groups consistently with the picker',
        codex.every(s => sourceGroupOf(s) === sourceGroupOf(codex[0])),
        codex.map(s => `${s.id}:${sourceGroupOf(s)}`).join(', '));
    check('no source maps to a group named "codex"',
        !everySource.some(src => sourceGroupOf({ source: src }) === 'codex'));
}

// Every group checkbox yields only systems from that group — the narrowing is real.
{
    const editor = makeEditor([{ baseType: 'empty' }]);
    for (const group of ['base', 'pok', 'te', 'ds', 'eron', 'other']) {
        const pool = getAvailableSystems(editor, { sources: { [group]: true } });
        check(`sources={${group}} yields only ${group} systems`,
            pool.every(s => sourceGroupOf(s) === group),
            pool.filter(s => sourceGroupOf(s) !== group).map(s => `${s.id}:${sourceGroupOf(s)}`).slice(0, 4).join(', '));
        check(`sources={${group}} is not empty`, pool.length > 0);
    }
}

// ── 3b. The panel's sources REPLACE the picker's, they don't intersect ────────
//
// The picker's filter persists in localStorage, so a user who narrowed it while browsing
// carries that state into the AutoMapper invisibly. Intersecting the two meant ticking
// Eronous with the picker left on Base produced "0 systems in pool" and a Type breakdown
// that was 0 across the board, with nothing on screen explaining why.

{
    const editor = makeEditor([{ baseType: 'empty' }]);
    const baseline = getAvailableSystems(editor, { sources: { eron: true, other: true } }).length;
    check('eron+other is a large pool to begin with', baseline > 100, `got ${baseline}`);

    // Narrow the picker to Base only, as browsing for a base-game tile would.
    const narrowed = defaultFilter();
    for (const k of Object.keys(narrowed.sources)) narrowed.sources[k] = (k === 'base');
    pickerStore.setFilter(narrowed);

    try {
        const withNarrowedPicker = getAvailableSystems(editor, { sources: { eron: true, other: true } });
        check('a narrowed picker does not empty the panel\'s source choice',
            withNarrowedPicker.length === baseline,
            `${withNarrowedPicker.length} vs ${baseline} with the picker on Base only`);
        check('and the tiles really are from the chosen groups',
            withNarrowedPicker.every(s => ['eron', 'other'].includes(sourceGroupOf(s))));

        // The safety guards are NOT part of that override.
        check('overriding sources still excludes weird/FOW/blank tiles',
            !withNarrowedPicker.some(isWeirdTile),
            withNarrowedPicker.filter(isWeirdTile).map(s => s.id).slice(0, 4).join(', '));
        check('overriding sources still excludes faction homeworlds',
            !withNarrowedPicker.some(hasFactionHomeworld));
        check('overriding sources still excludes hyperlanes',
            !withNarrowedPicker.some(s => s.isHyperlane));

        // With no explicit choice the picker's filter is still what governs.
        const followsPicker = getAvailableSystems(editor, {});
        check('no explicit sources still follows the picker',
            followsPicker.every(s => sourceGroupOf(s) === 'base'),
            `${followsPicker.length} systems, not all base`);
    } finally {
        pickerStore.__resetForTest();
    }
}

// ── 4. Faction homeworlds classify as homesystem ──────────────────────────────
//
// classifySystem keyed off planetType === 'FACTION'; seven Thunder's Edge / Theodisi
// homeworlds carry a null planetType and so classified as ordinary planet tiles.

{
    const NULL_TYPE_HOMEWORLDS = ['118', '92', '93', '95', '96a', '96b', 'th5'];
    for (const id of NULL_TYPE_HOMEWORLDS) {
        const sys = byId.get(id);
        check(`${id} classifies as homesystem`, sys && classifySystem(sys) === 'homesystem',
            sys ? classifySystem(sys) : 'system missing from data');
    }

    // Every faction homeworld, not just the seven — the invariant, not the sample.
    const misfiled = systems
        .filter(s => hasFactionHomeworld(s) && !s.isHyperlane)
        .filter(s => classifySystem(s) !== 'homesystem');
    check('no faction homeworld classifies as anything else', misfiled.length === 0,
        misfiled.map(s => `${s.id}→${classifySystem(s)}`).join(', '));
}

// ── 5. A plain 'special' hex is not a downgrade ───────────────────────────────
//
// 'special' with no effects painted means "a non-planet tile", which resolves to 'empty'.
// Reporting that as a failed downgrade painted the hex orange with a false explanation.

{
    const editor = makeEditor(repeat(4, { baseType: 'special' }));
    const result = fillRemaining(editor, {});
    check('plain special hexes report no downgrades', result.downgrades.length === 0,
        JSON.stringify(result.downgrades));
    check('plain special hexes still get filled', result.assignments.length === 4,
        `filled ${result.assignments.length}`);

    const { reqType, remapped } = resolveRequirement({ baseType: 'special', effects: new Set() });
    check('resolveRequirement maps bare special to empty', reqType === 'empty' && remapped);

    // With an effect painted it stays 'special' and is a real request.
    const withEffect = resolveRequirement({ baseType: 'special', effects: new Set(['nebula']) });
    check('special + effect stays special',
        withEffect.reqType === 'special' && withEffect.effectKey === 'nebula' && !withEffect.remapped);
}

// ── 5b. 'empty + anomaly' is the same request as 'special + anomaly' ──────────
//
// Both mean "a planet-free tile carrying this anomaly". classifySystem calls such a tile
// 'special', so an 'empty|asteroid' bucket can never exist — the fill fell through to the
// plain 'empty' chain and dropped a token on a blank tile every time, with real asteroid
// tiles sitting unused in the pool.

{
    const r = resolveRequirement({ baseType: 'empty', effects: new Set(['asteroid']) });
    check('empty + effect resolves to special',
        r.reqType === 'special' && r.effectKey === 'asteroid' && r.remapped,
        JSON.stringify(r));

    const plainEmpty = resolveRequirement({ baseType: 'empty', effects: new Set() });
    check('plain empty is untouched',
        plainEmpty.reqType === 'empty' && !plainEmpty.remapped);

    // A planet type with an effect keeps its planet count — only the planet-free pair maps.
    const onePlanet = resolveRequirement({ baseType: '1 planet', effects: new Set(['nebula']) });
    check('1 planet + effect keeps its type',
        onePlanet.reqType === '1 planet' && !onePlanet.remapped);
}

// The two spellings must produce identical results against the real pool.
{
    const ANOMALIES = ['asteroid', 'nebula', 'rift', 'supernova'];
    for (const eff of ANOMALIES) {
        const flag = { asteroid: 'isAsteroidField', nebula: 'isNebula', rift: 'isGravityRift', supernova: 'isSupernova' }[eff];
        for (const painted of ['special', 'empty']) {
            const editor = makeEditor(repeat(8, { baseType: painted, effects: [eff] }));
            const r = fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: true });
            const real = r.assignments.filter(a => byId.get(String(a.sys.id))?.[flag]).length;
            check(`8x "${painted} + ${eff}" all get a real ${eff} tile`, real === 8,
                `${real}/8 real, ${r.tokenPlacements.length} tokens`);
            check(`8x "${painted} + ${eff}" needs no tokens`, r.tokenPlacements.length === 0);
        }
    }
}

// Without duplicates it still degrades the same way for both spellings.
{
    const results = ['special', 'empty'].map(painted => {
        const editor = makeEditor(repeat(8, { baseType: painted, effects: ['asteroid'] }));
        const r = fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: false });
        return {
            real: r.assignments.filter(a => byId.get(String(a.sys.id))?.isAsteroidField).length,
            tokens: r.tokenPlacements.length,
            reason: r.downgrades[0]?.reason || '',
        };
    });
    check('duplicates OFF degrades identically for both spellings',
        results[0].real === results[1].real && results[0].tokens === results[1].tokens,
        JSON.stringify(results));
    check('duplicates OFF uses the 2 real base asteroid tiles first', results[0].real === 2,
        `${results[0].real} real`);
    check('the downgrade names the effect that ran out, not the type',
        /asteroid/.test(results[0].reason), results[0].reason);
}

// A hex painted for one anomaly must never receive a different one.
{
    const editor = makeEditor([
        ...repeat(4, { baseType: 'special', effects: ['asteroid'] }),
        ...repeat(4, { baseType: 'empty', effects: ['nebula'] }),
    ]);
    const r = fillRemaining(editor, { sources: { base: true }, allowDuplicatesNoPlanet: true });
    const wrong = r.assignments.filter(a => {
        const want = [...editor.hexes[a.label].effects][0];
        const s = byId.get(String(a.sys.id));
        if (!s) return false;
        const has = { asteroid: s.isAsteroidField, nebula: s.isNebula, rift: s.isGravityRift, supernova: s.isSupernova };
        // Carrying an anomaly the hex didn't ask for is the failure being guarded against.
        return Object.entries(has).some(([k, v]) => v && k !== want);
    });
    check('an anomaly hex never receives a different anomaly', wrong.length === 0,
        wrong.map(a => `${a.label}→${a.sys.id}`).join(', '));
}

// …and specifically at the boundary, where the only stock left is the wrong anomaly.
//
// The check above passes on any pool with enough compatible tiles, so it never reached the
// last-resort branch. That branch used to merely rank incompatible buckets last rather than
// exclude them, so once compatible stock ran out an asteroid hex took the last rift tile and
// had an asteroid token dropped on top — showing both anomalies, one of them unpainted.
{
    const anomaly = (id, flag) => ({ id, name: id, source: 'base', tileBack: 'red', planets: [], [flag]: true });

    // Only tile in the pool is a rift; the hex wants an asteroid.
    const onlyRift = makeEditor([{ label: '101', baseType: 'special', effects: ['asteroid'] }],
        [anomaly('RIFT1', 'isGravityRift')]);
    const r1 = fillRemaining(onlyRift, { sources: { base: true } });
    check('an asteroid hex refuses the last rift tile', r1.assignments.length === 0,
        r1.assignments.map(a => a.sys.id).join(', '));
    check('and says why it was left unfilled', /anomaly you didn't paint/.test(r1.unmatched[0]?.reason || ''),
        r1.unmatched[0]?.reason);

    // Same shape for a plain hex: a leftover anomaly tile is not filler for it either.
    const plain = makeEditor([{ label: '101', baseType: '1 planet' }],
        [anomaly('NEB1', 'isNebula')]);
    const r2 = fillRemaining(plain, { sources: { base: true } });
    check('a plain hex is not given a leftover anomaly tile', r2.assignments.length === 0,
        r2.assignments.map(a => a.sys.id).join(', '));

    // A compatible anomaly IS still usable — the rule is subset, not equality.
    const bothWanted = makeEditor([{ label: '101', baseType: 'special', effects: ['asteroid', 'nebula'] }],
        [anomaly('AST1', 'isAsteroidField')]);
    const r3 = fillRemaining(bothWanted, { sources: { base: true } });
    check('a tile whose anomaly was asked for is still usable as a base',
        r3.assignments.length === 1 && String(r3.assignments[0].sys.id) === 'AST1',
        JSON.stringify(r3.unmatched));
    check('and only the missing anomaly gets a token',
        JSON.stringify(r3.tokenPlacements) === JSON.stringify([{ label: '101', effects: ['nebula'] }]),
        JSON.stringify(r3.tokenPlacements));
}

// ── 6. The breakdown describes the pool the fill drains ───────────────────────

{
    const editor = makeEditor(repeat(4, { baseType: 'special' }));
    const analysis = analyzeMap(editor, {});
    const keys = analysis.requirements.map(q => q.key);
    check('breakdown buckets plain special under empty',
        keys.includes('empty') && !keys.includes('special'), keys.join(', '));
    const row = analysis.requirements.find(q => q.key === 'empty');
    check('breakdown records what it was painted as',
        row?.paintedAs?.includes('special'), JSON.stringify(row));
    check('breakdown need matches the hex count', row?.need === 4, `need ${row?.need}`);
}

// ── 6b. The breakdown is a dry run, so it cannot disagree with the fill ───────
//
// Every previous version counted pool sizes and re-derived the matching rules, which drifted
// every time: `special|asteroid` + `special|nebula` + … summed into one "special" number, so
// six hexes wanting scar against five non-scar anomaly tiles showed a green tick while all
// six got tokens. And `1 planet|nebula` counted toward plain `1 planet` demand, which the
// fill cannot use, understating a 5-hex shortfall as 3.

{
    const SCENARIOS = [
        ['scar on base (no scar tiles exist there)', repeat(6, { baseType: 'special', effects: ['scar'] }),
            { sources: { base: true }, allowDuplicatesNoPlanet: true }],
        ['four different anomalies competing', [
            ...repeat(4, { baseType: 'special', effects: ['asteroid'] }),
            ...repeat(4, { baseType: 'special', effects: ['nebula'] }),
            ...repeat(4, { baseType: 'special', effects: ['rift'] }),
            ...repeat(4, { baseType: 'special', effects: ['supernova'] }),
        ], { sources: { base: true } }],
        ['plain 1-planet demand against a short pool', repeat(10, { baseType: '1 planet' }),
            { sources: { pok: true } }],
        ['multi-effect hex', repeat(3, { baseType: 'special', effects: ['nebula', 'rift'] }), {}],
        ['restricted type with nothing to give', repeat(3, { baseType: 'fracture' }),
            { sources: { base: true } }],
        ['a realistic mixed map', [
            ...repeat(6, { baseType: '3 planet' }), ...repeat(10, { baseType: '2 planet' }),
            ...repeat(6, { baseType: '1 planet' }), ...repeat(4, { baseType: 'empty' }),
            ...repeat(3, { baseType: 'special', effects: ['nebula'] }),
            ...repeat(2, { baseType: 'empty', effects: ['asteroid'] }),
            { baseType: 'fracture' }, { baseType: 'legendary planet' },
        ], {}],
    ];

    for (const [name, specs, opts] of SCENARIOS) {
        const editor = makeEditor(specs);
        const a = analyzeMap(editor, opts);
        const r = fillRemaining(editor, opts);

        const sum = k => a.requirements.reduce((n, q) => n + q[k], 0);
        check(`[${name}] breakdown need total matches the hex count`,
            sum('need') === specs.length, `${sum('need')} vs ${specs.length}`);
        check(`[${name}] predicted tokens match the fill`,
            sum('token') === r.tokenPlacements.length,
            `table ${sum('token')} vs fill ${r.tokenPlacements.length}`);
        check(`[${name}] predicted unfilled match the fill`,
            sum('unfilled') === r.unmatched.length,
            `table ${sum('unfilled')} vs fill ${r.unmatched.length}`);
        check(`[${name}] every row is keyed like a pool bucket`,
            a.requirements.every(q => q.key === (q.effects.length ? `${q.type}|${[...q.effects].sort().join(',')}` : q.type)),
            a.requirements.map(q => q.key).join(', '));
        check(`[${name}] "have" is exact-match stock, never an aggregate`,
            a.requirements.every(q => q.have >= q.exact || q.repeatable),
            a.requirements.map(q => `${q.key}:have=${q.have},exact=${q.exact}`).join(' '));
    }
}

// The specific false greens that motivated the rewrite.
{
    const scar = analyzeMap(makeEditor(repeat(6, { baseType: 'special', effects: ['scar'] })),
        { sources: { base: true }, allowDuplicatesNoPlanet: true });
    const scarRow = scar.requirements.find(q => q.key === 'special|scar');
    check('a wanted anomaly with zero stock is not a green tick',
        scarRow && !scarRow.ok && scarRow.have === 0 && scarRow.token === 6, JSON.stringify(scarRow));

    const mixed = analyzeMap(makeEditor([
        ...repeat(4, { baseType: 'special', effects: ['asteroid'] }),
        ...repeat(4, { baseType: 'special', effects: ['nebula'] }),
    ]), { sources: { base: true } });
    check('anomalies get one row each, not one "special" total',
        mixed.requirements.length === 2 &&
        mixed.requirements.every(q => ['special|asteroid', 'special|nebula'].includes(q.key)),
        mixed.requirements.map(q => q.key).join(', '));

    const onePlanet = analyzeMap(makeEditor(repeat(10, { baseType: '1 planet' })), { sources: { pok: true } });
    const opRow = onePlanet.requirements.find(q => q.key === '1 planet');
    check('effect-bearing tiles do not inflate clean planet stock',
        opRow?.have === 5, `have ${opRow?.have} (clean bucket is 5)`);
}

// Deterministic: the table must not flicker between renders.
{
    const editor = makeEditor([
        ...repeat(8, { baseType: 'special', effects: ['asteroid'] }),
        ...repeat(6, { baseType: '2 planet' }), ...repeat(4, { baseType: 'empty' }),
    ]);
    const sig = () => JSON.stringify(analyzeMap(editor, { sources: { base: true } }).requirements);
    const first = sig();
    let stable = true;
    for (let i = 0; i < 25; i++) if (sig() !== first) stable = false;
    check('analyzeMap returns identical rows across 25 calls', stable);
}

// ── 6c. Filler resembles what was asked for ───────────────────────────────────
//
// The last-resort fallback ranked buckets by "effects ⊆ requested" and then by whatever
// order Object.keys returned, which made every clean bucket interchangeable: ten hexes
// painted '1 planet' against a short PoK pool came back holding Primor and Hope's End.
// Legendary tiles are scarce and game-defining — handing one out as filler is a balance
// change, not a near miss.

{
    const editor = makeEditor(repeat(10, { baseType: '1 planet' }));
    const r = fillRemaining(editor, { sources: { pok: true } });
    const isLegendary = s => (s?.planets || []).some(p => p.legendaryAbilityName && p.legendaryAbilityText);

    const leaked = r.assignments.filter(a => isLegendary(byId.get(String(a.sys.id))));
    check('a plain planet hex is never filled with a legendary tile', leaked.length === 0,
        leaked.map(a => `${a.label}→${a.sys.id} (${byId.get(String(a.sys.id))?.name})`).join(', '));

    // Substitutes should be the nearest planet count, not an arbitrary bucket.
    const counts = r.assignments.map(a => (byId.get(String(a.sys.id))?.planets || []).length);
    check('substitutes for a 1-planet hex stay close in planet count',
        counts.every(n => n <= 2), `planet counts: ${counts.join(', ')}`);
}

// Legendary remains reachable when it is what was actually painted.
{
    const editor = makeEditor(repeat(3, { baseType: 'legendary planet' }));
    const r = fillRemaining(editor, {});
    const isLegendary = s => (s?.planets || []).some(p => p.legendaryAbilityName && p.legendaryAbilityText);
    check('a legendary hex still gets a legendary tile',
        r.assignments.length === 3 && r.assignments.every(a => isLegendary(byId.get(String(a.sys.id)))),
        r.assignments.map(a => a.sys.id).join(', '));
}

// ── 7. Restricted hexes take their own type or nothing ────────────────────────
//
// The downgrade chain says fracture never downgrades; the last-resort fallback ignored it
// and handed a fracture hex an ordinary blue tile.

{
    const noFracture = systems.filter(s => s.tileBack !== 'fracture');
    const editor = makeEditor([{ label: '401', baseType: 'fracture' }], noFracture);
    const result = fillRemaining(editor, {});

    check('fracture hex with no fracture tiles is left unfilled', result.assignments.length === 0,
        result.assignments.map(a => `${a.sys.id}(${byId.get(String(a.sys.id))?.tileBack})`).join(', '));
    check('fracture hex is reported unmatched', result.unmatched.length === 1,
        JSON.stringify(result.unmatched));
    check('fracture hex carries an explanation',
        /fracture/.test(result.unmatched[0]?.reason || ''),
        result.unmatched[0]?.reason);
}

// A fracture hex WITH fracture tiles available still gets one.
{
    const editor = makeEditor([{ label: '401', baseType: 'fracture' }]);
    const result = fillRemaining(editor, {});
    const placed = byId.get(ids(result)[0]);
    check('fracture hex takes a fracture tile when one exists',
        placed?.tileBack === 'fracture', `got ${placed?.id} tileBack=${placed?.tileBack}`);
}

// Home-system hexes are restricted the same way.
{
    const noHomes = systems.filter(s => !hasFactionHomeworld(s));
    const editor = makeEditor([{ label: '501', baseType: 'homesystem' }], noHomes);
    const result = fillRemaining(editor, { includeHomeSystems: true });
    check('homesystem hex with no homeworlds is left unfilled', result.assignments.length === 0,
        result.assignments.map(a => a.sys.id).join(', '));
}

// ── 7b. "Include HS tiles" actually has homeworlds to work with ───────────────
//
// Faction homeworlds are hidden by default, so before the source filter was made
// unconditional this option only ever worked through the filter-bypass bug: turning it on
// with the picker filter applied left the pool with nothing a homesystem hex could take.

{
    const editor = makeEditor([{ label: '501', baseType: 'homesystem' }]);

    const off = getAvailableSystems(editor, { includeHomeSystems: false });
    check('homeworlds stay out of the pool by default', !off.some(hasFactionHomeworld),
        off.filter(hasFactionHomeworld).map(s => s.id).slice(0, 4).join(', '));

    const on = getAvailableSystems(editor, { includeHomeSystems: true });
    check('includeHomeSystems admits homeworlds', on.some(hasFactionHomeworld),
        `${on.length} systems, none with a faction homeworld`);
    check('includeHomeSystems does not admit weird tiles', !on.some(isWeirdTile),
        on.filter(isWeirdTile).map(s => s.id).slice(0, 4).join(', '));

    const result = fillRemaining(editor, { includeHomeSystems: true });
    check('a painted homesystem hex gets filled', result.assignments.length === 1,
        `filled ${result.assignments.length}: ${JSON.stringify(result.unmatched)}`);
    check('and it gets an actual homeworld tile',
        hasFactionHomeworld(byId.get(ids(result)[0]) || {}),
        `got ${ids(result)[0]}`);
}

// A homeworld tile must never reach an ordinary hex, even with the option on.
{
    const editor = makeEditor([
        { label: '501', baseType: 'homesystem' },
        ...repeat(20, { baseType: '2 planet' }),
        ...repeat(10, { baseType: '3 planet' }),
    ]);
    const result = fillRemaining(editor, { includeHomeSystems: true });
    const leaked = result.assignments
        .filter(a => a.label !== '501' && hasFactionHomeworld(byId.get(String(a.sys.id)) || {}));
    check('homeworld tiles never leak onto ordinary hexes', leaked.length === 0,
        leaked.map(a => `${a.label}→${a.sys.id}`).join(', '));
}

// ── 8. Balanced mode ──────────────────────────────────────────────────────────

{
    // One home system: nothing to balance against. Say so instead of running N attempts
    // and silently keeping the first.
    const editor = makeEditor([
        { label: '001', baseType: 'homesystem', realId: '1' },
        ...repeat(6, { baseType: '2 planet' }),
    ]);
    const result = fillRemaining(editor, { balanced: true, iterations: 10 });
    check('balanced with 1 home explains itself', !!result.notice, JSON.stringify(result.notice));
    check('balanced with 1 home still fills', result.assignments.length === 6,
        `filled ${result.assignments.length}`);
    check('balanced with 1 home reports no score', result.score === null, `score ${result.score}`);
}

{
    // Four homes, value targets painted. Skew used to be a deterministic greedy pick, so
    // every iteration produced an identical assignment and `iterations` did nothing.
    const editor = makeEditor([
        { label: '001', baseType: 'homesystem', realId: '1' },
        { label: '002', baseType: 'homesystem', realId: '2' },
        { label: '003', baseType: 'homesystem', realId: '3' },
        { label: '004', baseType: 'homesystem', realId: '4' },
        ...repeat(8, { baseType: '2 planet', valueTarget: { tier: 5, r: true, i: false, t: false } }),
    ]);
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
        seen.add(ids(fillRemaining(editor, { balanced: false, valueROn: true })).join(','));
    }
    check('value-target picks vary across runs', seen.size > 1,
        `${seen.size} distinct results in 20 runs`);

    const balanced = fillRemaining(editor, { balanced: true, iterations: 8 });
    check('balanced with 4 homes reports a score', typeof balanced.score === 'number',
        `score ${balanced.score}`);
    check('balanced with 4 homes has no notice', !balanced.notice, JSON.stringify(balanced.notice));
}

// ── 9. Standing invariants over the default pool ──────────────────────────────

{
    const editor = makeEditor([{ baseType: 'empty' }]);
    const pool = getAvailableSystems(editor, {});

    check('default pool excludes hyperlanes', !pool.some(s => s.isHyperlane));
    check('default pool excludes weird/FOW/blank tiles', !pool.some(isWeirdTile),
        pool.filter(isWeirdTile).map(s => s.id).slice(0, 5).join(', '));
    check('default pool excludes faction homeworlds', !pool.some(hasFactionHomeworld),
        pool.filter(hasFactionHomeworld).map(s => s.id).slice(0, 5).join(', '));
    check('default pool excludes wormhole systems', !pool.some(s => s.wormholes?.length));
    check('default pool excludes Mecatol Rex',
        !pool.some(s => s.name?.toLowerCase().includes('mecatol')));
    check('default pool has no duplicate ids',
        new Set(pool.map(s => String(s.id).toUpperCase())).size === pool.length);

    const withWormholes = getAvailableSystems(editor, { includeWormholes: true });
    check('includeWormholes widens the pool', withWormholes.length > pool.length,
        `${withWormholes.length} vs ${pool.length}`);
}

// Already-placed tiles are not offered again.
{
    const editor = makeEditor([
        { label: '001', baseType: '2 planet', realId: '19' },
        { label: '002', baseType: '2 planet' },
    ]);
    const pool = getAvailableSystems(editor, {}).map(s => String(s.id).toUpperCase());
    check('a tile already on the map is not in the pool', !pool.includes('19'));
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nautomapper: ${passed} checks passed, ${failures.length} failed ` +
    `(${systems.length} systems)`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
