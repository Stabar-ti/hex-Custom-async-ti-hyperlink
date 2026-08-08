/**
 * Tests for the system picker's filter algebra, search language and sorters, run against
 * the real modules and the real public/data/SystemInfo.json.
 *
 *   node tools/test-system-picker.js      (or: npm test)
 *
 * The point of the exercise is the first block: a frozen copy of the OLD DOM-driven filter
 * logic, asserted tile-for-tile against the new predicate across a matrix of filter states.
 * The picker rewrite moves ~2,200 lines of UI, and this is what makes that move safe —
 * without it, "the list looks about right" is the only available check.
 *
 * The picker modules used here are pure — no DOM — so they import straight into node.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    SOURCE_GROUPS, ATTRIBUTES, PLANET_COUNTS, TRI_VALUES, COLUMNS,
    sourceGroupOf, defaultFilter, isWeirdTile, hasFactionHomeworld, wormholesOf
} from '../src/modules/SystemPicker/pickerModel.js';
import {
    parseQuery, matchesQuery, scoreMatch, systemHaystacks,
    sortSystems, highlightMatches, QUERY_FIELDS
} from '../src/modules/SystemPicker/pickerQuery.js';
import {
    passesFilter, selectSystems, autoMapperFilter,
    activeFilterCount, describeActiveFilters
} from '../src/modules/SystemPicker/pickerSelect.js';
import * as store from '../src/modules/SystemPicker/pickerState.js';

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

check('SystemInfo.json loaded', Array.isArray(systems) && systems.length > 500,
    `got ${systems?.length}`);

// ── 1. Equivalence with the old DOM-driven logic ──────────────────────────────
//
// A verbatim port of uiFilters.js:899-950 as it stood before the rewrite, reading a
// plain object instead of button elements. `btn` maps a legacy filter key to its
// dataset.active boolean.

const LEGACY_SOURCE_KEYS = ['sourceBase', 'sourcePok', 'sourceDS', 'sourceEronous', 'sourceThundersEdge', 'sourceOthers'];

const LEGACY_ATTR_TESTS = {
    hasWormhole: (sys, a) => { if (!a) return true; return Array.isArray(sys.wormholes) && sys.wormholes.length > 0 && sys.wormholes.some(w => w !== 'null' && w !== null); },
    hasTech:     (sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.some(p => (Array.isArray(p.techSpecialties) && p.techSpecialties.length > 0) || (!!p.techSpecialty)); },
    hasRift:     (sys, a) => { if (!a) return true; return sys.isGravityRift === true; },
    hasNebula:   (sys, a) => { if (!a) return true; return sys.isNebula === true; },
    hasAsteroids:(sys, a) => { if (!a) return true; return sys.isAsteroidField === true; },
    hasSupernova:(sys, a) => { if (!a) return true; return sys.isSupernova === true; },
    hasScar:     (sys, a) => { if (!a) return true; return sys.isScar === true; },
    noPlanets:   (sys, a) => { if (!a) return true; return !Array.isArray(sys.planets) || sys.planets.length === 0; },
    onePlanet:   (sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 1; },
    twoPlanets:  (sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 2; },
    threePlanets:(sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.length === 3; },
    isLegendary: (sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && sys.planets.some(p => !!p.legendaryAbilityName); },
    isFracture:  (sys, a) => { if (!a) return true; return sys.tileBack === 'fracture'; },
    noFaction:   (sys, a) => { if (!a) return true; return Array.isArray(sys.planets) && !sys.planets.some(p => !!p.factionHomeworld); },
    showHyperlanes: (sys, active) => active ? !!sys.isHyperlane : !sys.isHyperlane,
    weirdTiles:  (sys, a) => {
        const txt = `${sys.id} ${sys.name}`.toLowerCase();
        const isWeird = /fow|blank|-1|Prison|0b|0g|0r|0gray|0border/.test(txt);
        return a ? !isWeird : isWeird;
    }
};

/** The old predicate, minus the `editor.hexes[sys.id]?.baseType` line (that's defect #2 below). */
function legacyPasses(sys, btn, mode = 'and') {
    const activeSources = LEGACY_SOURCE_KEYS.filter(k => btn[k]);
    if (activeSources.length === 0) return false;

    const sourceMatches = activeSources.some(key => {
        const source = (sys.source || '').toLowerCase();
        switch (key) {
            case 'sourceBase': return source === 'base';
            case 'sourcePok': return source === 'pok';
            case 'sourceDS': return source === 'ds' || source === 'uncharted_space';
            case 'sourceEronous': return source === 'eronous';
            case 'sourceThundersEdge': return source === 'thunders_edge';
            case 'sourceOthers':
                return ['other', 'draft', 'dane_leaks'].includes(source) ||
                    (source !== '' && !['base', 'pok', 'ds', 'uncharted_space', 'eronous', 'thunders_edge'].includes(source));
            default: return false;
        }
    });
    if (!sourceMatches) return false;

    const results = Object.keys(LEGACY_ATTR_TESTS).map(k => LEGACY_ATTR_TESTS[k](sys, !!btn[k]));
    return mode === 'nand' ? results.some(r => !r) : results.every(r => r);
}

/** The legacy button state equivalent to a new-style filter, for the states both can express. */
function toLegacyButtons(filter) {
    return {
        sourceBase: filter.sources.base,
        sourcePok: filter.sources.pok,
        sourceDS: filter.sources.ds,
        sourceEronous: filter.sources.eron,
        sourceThundersEdge: filter.sources.te,
        sourceOthers: filter.sources.other,

        hasWormhole: !!filter.attrs.hasWormhole,
        hasTech: !!filter.attrs.hasTech,
        hasRift: !!filter.attrs.hasRift,
        hasNebula: !!filter.attrs.hasNebula,
        hasAsteroids: !!filter.attrs.hasAsteroids,
        hasSupernova: !!filter.attrs.hasSupernova,
        hasScar: !!filter.attrs.hasScar,
        isLegendary: !!filter.attrs.isLegendary,
        isFracture: !!filter.attrs.isFracture,

        noPlanets: filter.planetCounts.includes(0),
        onePlanet: filter.planetCounts.includes(1),
        twoPlanets: filter.planetCounts.includes(2),
        threePlanets: filter.planetCounts.includes(3),

        // The tri-states, in the two positions the old booleans could reach.
        noFaction: filter.tri.faction === 'hide',
        showHyperlanes: filter.tri.hyperlanes === 'only',
        weirdTiles: filter.tri.weird === 'hide'
    };
}

function withFilter(patch) {
    const f = defaultFilter();
    return {
        ...f, ...patch,
        sources: { ...f.sources, ...(patch.sources || {}) },
        attrs: { ...f.attrs, ...(patch.attrs || {}) },
        tri: { ...f.tri, ...(patch.tri || {}) }
    };
}

// The matrix. Only states the old encoding could actually express: at most one planet
// count (two or more always returned nothing), and tri-states off 'any'.
const MATRIX = [
    ['defaults', withFilter({})],
    ['base only', withFilter({ sources: { pok: false, ds: false, eron: false, te: false, other: false } })],
    ['no sources', withFilter({ sources: { base: false, pok: false, ds: false, eron: false, te: false, other: false } })],
    ['others only', withFilter({ sources: { base: false, pok: false, ds: false, eron: false, te: false } })],
    ['wormholes', withFilter({ attrs: { hasWormhole: true } })],
    ['tech', withFilter({ attrs: { hasTech: true } })],
    ['legendary', withFilter({ attrs: { isLegendary: true } })],
    ['rift+nebula', withFilter({ attrs: { hasRift: true, hasNebula: true } })],
    ['all anomalies', withFilter({ attrs: { hasRift: true, hasNebula: true, hasAsteroids: true, hasSupernova: true, hasScar: true } })],
    ['fracture', withFilter({ attrs: { isFracture: true } })],
    ['0 planets', withFilter({ planetCounts: [0] })],
    ['1 planet', withFilter({ planetCounts: [1] })],
    ['2 planets', withFilter({ planetCounts: [2] })],
    ['3 planets', withFilter({ planetCounts: [3] })],
    ['faction allowed', withFilter({ tri: { faction: 'any' } })],
    ['hyperlanes only', withFilter({ tri: { hyperlanes: 'only' } })],
    ['weird only', withFilter({ tri: { weird: 'only' } })],
    ['tech + 2 planets', withFilter({ attrs: { hasTech: true }, planetCounts: [2] })],
    ['wormhole + base', withFilter({ attrs: { hasWormhole: true }, sources: { pok: false, ds: false, eron: false, te: false, other: false } })]
];

for (const [name, filter] of MATRIX) {
    const f = { ...filter, mode: 'and' };
    const btn = toLegacyButtons(f);
    const mismatches = systems.filter(sys =>
        passesFilter(sys, f) !== legacyPasses(sys, btn, 'and'));
    check(`equivalence: ${name}`, mismatches.length === 0,
        mismatches.length ? `${mismatches.length} differ, e.g. ${mismatches.slice(0, 4).map(s => s.id).join(', ')}` : '');
}

// NAND is deliberately NOT equivalent, and this is the one place that says why.
//
// The old NAND ran over all 16 attribute tests at once — including the exclusions. So
// "NAND with default filters" meant "show me tiles that are a faction homeworld, or
// weird, or a hyperlane", which is not a thing anyone asked for and is not what the
// button's own tooltip claimed. Here NAND scopes to the active *requirements*: with two
// attributes on, it means "has one but not the other". Exclusions stay exclusions.
{
    const noAttrs = withFilter({ mode: 'nand' });
    check('NAND with no requirements is a no-op',
        systems.filter(s => passesFilter(s, noAttrs)).length ===
        systems.filter(s => passesFilter(s, withFilter({}))).length,
        'nothing has been asked for, so nothing can fail');

    const legacyNoAttrs = systems.filter(s => legacyPasses(s, toLegacyButtons(noAttrs), 'nand')).length;
    check('...unlike the old NAND, which returned the excluded junk',
        legacyNoAttrs !== systems.filter(s => passesFilter(s, noAttrs)).length,
        `old NAND returned ${legacyNoAttrs} tiles here — the behaviour change is intended`);

    // Two requirements, NAND: everything that fails at least one of them.
    const both = withFilter({ attrs: { hasTech: true, hasWormhole: true } });
    const nand = withFilter({ attrs: { hasTech: true, hasWormhole: true }, mode: 'nand' });
    const andSet = new Set(systems.filter(s => passesFilter(s, both)).map(s => s.id));
    const nandSet = new Set(systems.filter(s => passesFilter(s, nand)).map(s => s.id));
    const pool = systems.filter(s => passesFilter(s, withFilter({}))).map(s => s.id);

    check('AND and NAND are disjoint', [...andSet].every(id => !nandSet.has(id)));
    check('AND and NAND partition the filtered pool',
        andSet.size + nandSet.size === pool.length,
        `${andSet.size} + ${nandSet.size} vs ${pool.length}`);
}

// ── 2. The tiles-101-106 regression ───────────────────────────────────────────
//
// The old filter dropped any system whose id matched a populated hex *label*
// (`editor.hexes[sys.id]?.baseType`). Hex labels are ring + 2-digit column, so ring 1 is
// "101".."106" — and systems 101-106 exist. Those six Thunder's Edge tiles were
// unreachable in the picker on any map with a populated inner ring.

{
    const f = defaultFilter();
    const visible = new Set(systems.filter(s => passesFilter(s, f)).map(s => String(s.id)));
    const missing = ['101', '102', '103', '104', '105', '106'].filter(id => !visible.has(id));
    check('tiles 101-106 are selectable under default filters', missing.length === 0,
        missing.length ? `missing: ${missing.join(', ')}` : '');

    // ...and these really are the ids that collide with a hex label. Ring N has 6N
    // hexes labelled `${N}${col:2}`, so ring 1 is 101..106 — mirroring generateRings()
    // in src/draw/drawHexes.js. Only 1xx system ids exist, so ring 1 is the whole
    // collision surface: ids 100 and 107+ look hex-shaped but match no real label.
    const hexLabels = new Set();
    for (let ring = 1; ring <= 9; ring++) {
        for (let col = 1; col <= 6 * ring; col++) hexLabels.add(`${ring}${String(col).padStart(2, '0')}`);
    }
    const colliding = systems.map(s => String(s.id)).filter(id => hexLabels.has(id)).sort();
    check('the id/hex-label collision set is exactly 101-106',
        colliding.join(',') === '101,102,103,104,105,106',
        `colliding ids: ${colliding.join(', ')}`);
}

// ── 3. The source partition ───────────────────────────────────────────────────

{
    const orphans = systems.filter(s => sourceGroupOf(s) === null);
    check('every system has a source group', orphans.length === 0,
        orphans.length ? `${orphans.length} without a source, e.g. ${orphans.slice(0, 3).map(s => s.id).join(', ')}` : '');

    // Exactly one group each: turning on a single source must partition the corpus.
    const perGroup = {};
    for (const g of SOURCE_GROUPS) {
        const only = defaultFilter();
        for (const k of Object.keys(only.sources)) only.sources[k] = (k === g.key);
        perGroup[g.key] = systems.filter(s => passesFilter(s, only)).length;
    }
    const summed = Object.values(perGroup).reduce((a, b) => a + b, 0);
    const allOn = systems.filter(s => passesFilter(s, defaultFilter())).length;

    // Compare like with like: the per-group counts also apply the default tri-states.
    check('source groups partition the corpus', summed === allOn,
        `sum of groups ${summed} vs all-sources ${allOn} — ${JSON.stringify(perGroup)}`);

    // A source value that appears in the data but in no named group lands in 'other'.
    // If this ever counts zero after a SystemInfo.json resync, a source was renamed.
    check('the "other" bucket is non-empty', perGroup.other > 0, `other = ${perGroup.other}`);
}

// ── 4. Tri-state algebra ──────────────────────────────────────────────────────

for (const key of ['faction', 'hyperlanes', 'weird']) {
    const set = value => new Set(
        systems.filter(s => passesFilter(s, withFilter({ tri: { [key]: value } }))).map(s => s.id));

    const hide = set('hide'), only = set('only'), any = set('any');
    const overlap = [...hide].filter(id => only.has(id));
    const uncovered = [...hide, ...only].filter(id => !any.has(id));

    check(`tri ${key}: hide and only are disjoint`, overlap.length === 0,
        overlap.length ? `${overlap.length} in both` : '');
    check(`tri ${key}: any covers hide + only`, uncovered.length === 0,
        uncovered.length ? `${uncovered.length} uncovered` : '');
    check(`tri ${key}: any is the union`, any.size === hide.size + only.size,
        `any ${any.size} vs ${hide.size} + ${only.size}`);
}

check('TRI_VALUES is exactly the three positions',
    TRI_VALUES.join(',') === 'hide,only,any');

// ── 5. Planet counts are OR-ed ────────────────────────────────────────────────

{
    const count = list => systems.filter(s => passesFilter(s, withFilter({ planetCounts: list }))).length;

    check('planet counts OR rather than AND',
        count([1, 2]) === count([1]) + count([2]),
        `[1,2]=${count([1, 2])} vs ${count([1])}+${count([2])}`);
    check('...and this is the case the old encoding got wrong', count([1, 2]) > 0,
        'the old picker returned 0 rows for "1 Planet" + "2 Planets"');
    check('an empty planet-count list is no constraint',
        count([]) === systems.filter(s => passesFilter(s, defaultFilter())).length);
    check('all four counts together match no constraint',
        count([0, 1, 2, 3]) === count([]),
        `${count([0, 1, 2, 3])} vs ${count([])} — a tile with >3 planets would explain a gap`);
    check('PLANET_COUNTS covers 0..3', PLANET_COUNTS.map(p => p.count).join(',') === '0,1,2,3');
}

// ── 6. Query parsing ──────────────────────────────────────────────────────────

{
    const p = parseQuery('tech:cybernetic -fow "new terra" name:lodor');
    check('parses four terms', p.terms.length === 4, JSON.stringify(p.terms));
    check('field prefix captured', p.terms[0].field === 'tech' && p.terms[0].value === 'cybernetic');
    check('negation captured', p.terms[1].negated === true && p.terms[1].value === 'fow');
    check('quotes group whitespace', p.terms[2].value === 'new terra' && p.terms[2].field === null);
    check('second prefix captured', p.terms[3].field === 'name' && p.terms[3].value === 'lodor');

    check('empty query has no terms', parseQuery('').terms.length === 0);
    check('whitespace-only query has no terms', parseQuery('   ').terms.length === 0);
    check('values are lowercased', parseQuery('NAME:Lodor').terms[0].value === 'lodor');
    check('prefixes are lowercased', parseQuery('TECH:x').terms[0].field === 'tech');

    // An unknown prefix must not silently drop the text.
    const unknown = parseQuery('bogus:thing');
    check('unknown prefix falls back to literal text',
        unknown.terms.length === 1 && unknown.terms[0].field === null && unknown.terms[0].value === 'bogus:thing',
        JSON.stringify(unknown.terms));

    const quotedField = parseQuery('name:"new terra"');
    check('a prefix can take a quoted value',
        quotedField.terms[0].field === 'name' && quotedField.terms[0].value === 'new terra',
        JSON.stringify(quotedField.terms));

    check('QUERY_FIELDS are all reachable',
        QUERY_FIELDS.every(f => parseQuery(`${f}:x`).terms[0].field === f));
}

// ── 7. Query matching ─────────────────────────────────────────────────────────

{
    const find = q => { const p = parseQuery(q); return systems.filter(s => matchesQuery(s, p)); };

    const byId = find('id:18');
    check('id:18 finds tile 18', byId.some(s => String(s.id) === '18'));
    check('id:18 matches on substring, not equality',
        byId.some(s => String(s.id) === 'd18'),
        'every field matches by substring; ranking, not filtering, is what surfaces the exact tile');
    // Which is why the ordering has to carry the weight: 26 ids contain "18".
    check('...and the exact tile is ranked first',
        selectSystems(systems, { query: 'id:18' }).results[0].id === '18',
        `got ${selectSystems(systems, { query: 'id:18' }).results.slice(0, 4).map(s => s.id).join(', ')}`);

    // The regression this whole field exists for: aliases were dropped in the rewrite.
    const tile18 = systems.find(s => String(s.id) === '18');
    check('tile 18 has aliases in the data', Array.isArray(tile18?.aliases) && tile18.aliases.length > 0,
        JSON.stringify(tile18?.aliases));
    if (tile18?.aliases?.length) {
        const alias = tile18.aliases.find(a => a && /^[a-z]{3,}$/i.test(a)) || tile18.aliases[0];
        check(`unprefixed alias search finds its tile ("${alias}")`,
            find(String(alias).toLowerCase()).some(s => String(s.id) === '18'));
        check(`alias: prefix finds its tile ("${alias}")`,
            find(`alias:${String(alias).toLowerCase()}`).some(s => String(s.id) === '18'));
    }

    // src: makes the ~200-tile "Others" bucket addressable for the first time.
    //
    // Checked through the WHOLE pipeline, not just matchesQuery: the first version of
    // this test asserted on matching alone and happily passed for `src:andcat`, which
    // returns nothing in the actual picker because all 63 andcat tiles are hyperlanes
    // and the default filter hides those. A search test that skips the filter stage is
    // not testing what the user types.
    const somno = selectSystems(systems, { filter: defaultFilter(), query: 'src:somno' }).results;
    check('src:somno reaches a source that has no button of its own',
        somno.length > 0, `got ${somno.length}`);
    check('src:somno returns only somno tiles',
        somno.every(s => (s.source || '').toLowerCase().includes('somno')));

    // The andcat case itself, asserted rather than assumed.
    const andcat = selectSystems(systems, { filter: defaultFilter(), query: 'src:andcat' }).results;
    check('src:andcat is empty under default filters (all hyperlanes)', andcat.length === 0,
        `got ${andcat.length}`);
    check('...and non-empty once hyperlanes are allowed',
        selectSystems(systems, { filter: withFilter({ tri: { hyperlanes: 'any' } }), query: 'src:andcat' })
            .results.length > 0);

    const techQ = find('tech:cybernetic');
    const techExpected = systems.filter(s =>
        (s.planets || []).some(p => (p.techSpecialties || []).some(t => String(t).toLowerCase().includes('cybernetic'))));
    check('tech:cybernetic matches an independent count',
        techQ.length === techExpected.length, `${techQ.length} vs ${techExpected.length}`);

    check('multiple terms AND together',
        find('tech:cybernetic src:pok').every(s =>
            (s.source || '').toLowerCase().includes('pok')));

    const negated = find('-fow');
    check('negation excludes matches',
        negated.every(s => !systemHaystacks(s).all.includes('fow')) && negated.length > 0);

    check('an empty query matches everything',
        systems.filter(s => matchesQuery(s, parseQuery(''))).length === systems.length);

    // Numeric tokens still reach digits embedded in an id, as the old search did.
    check('a numeric token matches digits inside an id',
        find('13').some(s => String(s.id).toLowerCase() === 'd13' || String(s.id) === '13'));
}

// ── 8. Ranking is deterministic and puts the obvious answer first ─────────────

{
    const p = parseQuery('18');
    const ranked = systems.filter(s => matchesQuery(s, p))
        .map(s => ({ s, score: scoreMatch(s, p) }))
        .sort((a, b) => b.score - a.score);
    check('exact id ranks first for "18"', String(ranked[0].s.id) === '18',
        `got ${ranked[0].s.id} (${ranked.slice(0, 3).map(r => `${r.s.id}:${r.score}`).join(', ')})`);

    // Same input, same output — no dependence on object identity or iteration order.
    const once = selectSystems(systems, { query: 'lodor' }).results.map(s => s.id).join(',');
    const twice = selectSystems(systems.slice(), { query: 'lodor' }).results.map(s => s.id).join(',');
    check('relevance ordering is stable across runs', once === twice);

    check('a non-matching system scores 0',
        scoreMatch({ id: 'zzz', name: 'zzz', planets: [] }, parseQuery('lodor')) === 0);
}

// ── 9. Sorting is total ───────────────────────────────────────────────────────

for (const col of COLUMNS) {
    for (const dir of ['asc', 'desc']) {
        let ok = true, detail = '';
        try {
            const sorted = sortSystems(systems, col.key, dir, { isUsed: () => false });
            ok = sorted.length === systems.length;
            if (!ok) detail = `${sorted.length} of ${systems.length}`;
        } catch (e) {
            ok = false; detail = e.message;
        }
        check(`sort by ${col.key} (${dir}) is total`, ok, detail);
    }
}

{
    const asc = sortSystems(systems, 'resources', 'asc').map(s => s.id);
    const desc = sortSystems(systems, 'resources', 'desc').map(s => s.id);
    check('asc and desc really differ', asc.join(',') !== desc.join(','));
    check('sorting preserves the corpus',
        new Set(asc).size === new Set(systems.map(s => s.id)).size);

    check('an unknown sort column returns the list unchanged',
        sortSystems(systems, 'nonsense', 'asc').length === systems.length);
    check('a null sort column returns the list unchanged',
        sortSystems(systems, null, 'asc').length === systems.length);

    // Ties must not shuffle: sorting an already-sorted list twice is a no-op.
    const once = sortSystems(systems, 'legendary', 'asc').map(s => s.id).join(',');
    const twice = sortSystems(sortSystems(systems, 'legendary', 'asc'), 'legendary', 'asc').map(s => s.id).join(',');
    check('sorting is idempotent on ties', once === twice);
}

// ── 10. The pipeline and its counts ───────────────────────────────────────────

{
    const used = new Set(['18', '19', '20']);
    const isUsed = id => used.has(String(id));

    const out = selectSystems(systems, { filter: defaultFilter(), query: '', sort: {} }, { isUsed });
    check('counts.total is the whole corpus', out.counts.total === systems.length);
    check('counts.afterFilter <= total', out.counts.afterFilter <= out.counts.total);
    check('with no query, afterSearch === afterFilter',
        out.counts.afterSearch === out.counts.afterFilter);
    check('results length matches afterSearch', out.results.length === out.counts.afterSearch);
    check('hiddenByFilter adds up',
        out.counts.hiddenByFilter === out.counts.total - out.counts.afterFilter);

    const q = selectSystems(systems, { query: 'lodor' }, { isUsed });
    check('a query narrows the results', q.counts.afterSearch < q.counts.afterFilter);
    check('hiddenBySearch adds up',
        q.counts.hiddenBySearch === q.counts.afterFilter - q.counts.afterSearch);

    // unplacedOnly is the honest replacement for the old "silently drop placed tiles".
    const all = selectSystems(systems, { filter: defaultFilter() }, { isUsed });
    const unplaced = selectSystems(systems, { filter: withFilter({ unplacedOnly: true }) }, { isUsed });
    const removed = all.counts.afterFilter - unplaced.counts.afterFilter;
    check('unplacedOnly drops exactly the used tiles that were visible', removed === all.counts.used,
        `removed ${removed}, used-and-visible ${all.counts.used}`);
    check('by default, used tiles stay in the list', all.counts.used > 0,
        'placed tiles should be marked, not hidden');

    check('a pinned sort column overrides relevance',
        selectSystems(systems, { query: 'a', sort: { column: 'id', direction: 'asc' } }).results[0].id ===
        sortSystems(selectSystems(systems, { query: 'a' }).results, 'id', 'asc')[0].id);
}

// ── 11. The AutoMapper projection ─────────────────────────────────────────────

{
    // Whatever the user does in the picker, generated maps never get FOW/blank tiles
    // or hyperlanes.
    const permissive = withFilter({
        tri: { weird: 'only', hyperlanes: 'only', faction: 'any' },
        attrs: { hasWormhole: true },
        planetCounts: [3],
        unplacedOnly: true
    });
    const am = autoMapperFilter(permissive);

    check('autoMapperFilter forces weird tiles off', am.tri.weird === 'hide');
    check('autoMapperFilter forces hyperlanes off', am.tri.hyperlanes === 'hide');
    check('autoMapperFilter respects the faction choice', am.tri.faction === 'any');
    check('autoMapperFilter drops browsing attributes', Object.keys(am.attrs).length === 0);
    check('autoMapperFilter drops planet counts', am.planetCounts.length === 0);
    check('autoMapperFilter never restricts to unplaced', am.unplacedOnly === false);

    const placeable = systems.filter(s => passesFilter(s, am));
    check('no hyperlane is auto-placeable', !placeable.some(s => s.isHyperlane));
    check('no weird tile is auto-placeable', !placeable.some(s => isWeirdTile(s)));
    check('the auto-placeable pool is non-empty', placeable.length > 0, `got ${placeable.length}`);

    // Source choices carry through — the thing that was impossible with the picker closed.
    const baseOnly = autoMapperFilter(withFilter({ sources: { pok: false, ds: false, eron: false, te: false, other: false } }));
    const basePool = systems.filter(s => passesFilter(s, baseOnly));
    check('autoMapperFilter carries source choices through',
        basePool.length > 0 && basePool.every(s => (s.source || '').toLowerCase() === 'base'),
        `${basePool.length} tiles`);
}

// ── 12. Filter summaries ──────────────────────────────────────────────────────

{
    check('the default filter counts as zero active', activeFilterCount(defaultFilter()) === 0);
    check('an attribute counts as one', activeFilterCount(withFilter({ attrs: { hasTech: true } })) === 1);
    check('a switched-off source counts',
        activeFilterCount(withFilter({ sources: { base: false } })) === 1);
    check('planet counts count once regardless of how many',
        activeFilterCount(withFilter({ planetCounts: [1, 2, 3] })) === 1);
    check('a tri-state moved off its default counts',
        activeFilterCount(withFilter({ tri: { weird: 'any' } })) === 1);

    const chips = describeActiveFilters(withFilter({
        attrs: { hasTech: true, hasWormhole: true },
        planetCounts: [1, 2],
        tri: { faction: 'any' },
        unplacedOnly: true
    }));
    check('describeActiveFilters returns one chip per active filter', chips.length === 5,
        JSON.stringify(chips.map(c => c.label)));
    check('every chip carries a kind and a label',
        chips.every(c => c.kind && c.label));
    check('the default filter produces no chips', describeActiveFilters(defaultFilter()).length === 0);
}

// ── 13. Model helpers behave on the real data ─────────────────────────────────

{
    check('ATTRIBUTES all have a test', ATTRIBUTES.every(a => typeof a.test === 'function'));
    check('ATTRIBUTES keys are unique', new Set(ATTRIBUTES.map(a => a.key)).size === ATTRIBUTES.length);
    check('COLUMNS keys are unique', new Set(COLUMNS.map(c => c.key)).size === COLUMNS.length);

    // wormholesOf must treat the literal string "null" as absence — it is a real value
    // in SystemInfo.json and counting it would make "Has Wormhole" meaningless.
    check('wormholesOf drops the "null" sentinel',
        wormholesOf({ wormholes: ['alpha', 'null', null] }).join(',') === 'alpha');
    check('wormholesOf accepts a Set',
        wormholesOf({ wormholes: new Set(['beta']) }).join(',') === 'beta');
    check('wormholesOf tolerates a missing field', wormholesOf({}).length === 0);

    check('hasFactionHomeworld finds real homeworlds',
        systems.filter(hasFactionHomeworld).length > 0);
    check('isWeirdTile flags something', systems.filter(isWeirdTile).length > 0);

    check('highlightMatches escapes HTML',
        highlightMatches('<b>x</b>', []) === '&lt;b&gt;x&lt;/b&gt;');
    check('highlightMatches wraps a token',
        highlightMatches('Lodor', ['lod']) === '<mark>Lod</mark>or');
    check('highlightMatches survives regex metacharacters in a token',
        highlightMatches('a+b', ['+']) === 'a<mark>+</mark>b');
    check('highlightMatches with no tokens is just escaping',
        highlightMatches('plain', []) === 'plain');
}

// ── 14. Store reducers ────────────────────────────────────────────────────────
//
// The store must import under node at all — it touches localStorage, which does not
// exist here, so every access is guarded. If that guard ever breaks, this file throws
// on import rather than failing a check.

{
    store.__resetForTest();

    check('the store starts at the defaults', activeFilterCount(store.getFilter()) === 0);

    store.toggleAttr('hasTech');
    check('toggleAttr switches an attribute on', store.getFilter().attrs.hasTech === true);
    store.toggleAttr('hasTech');
    check('toggleAttr is its own inverse', !('hasTech' in store.getFilter().attrs),
        'the key must be deleted, not set false — describeActiveFilters counts keys');

    store.toggleSource('base');
    check('toggleSource switches a source off', store.getFilter().sources.base === false);
    store.setSourcesAll(true);
    check('setSourcesAll(true) restores every source',
        Object.values(store.getFilter().sources).every(Boolean));

    store.togglePlanetCount(2);
    store.togglePlanetCount(1);
    check('planet counts accumulate and stay sorted',
        store.getFilter().planetCounts.join(',') === '1,2');
    store.togglePlanetCount(1);
    check('planet counts remove on re-toggle', store.getFilter().planetCounts.join(',') === '2');

    store.cycleTri('weird');
    check('cycleTri steps hide -> only', store.getFilter().tri.weird === 'only');
    store.cycleTri('weird');
    check('cycleTri steps only -> any', store.getFilter().tri.weird === 'any');
    store.cycleTri('weird');
    check('cycleTri wraps any -> hide', store.getFilter().tri.weird === 'hide');
    store.setTri('weird', 'nonsense');
    check('setTri rejects a value outside the three positions', store.getFilter().tri.weird === 'hide');

    store.clearFilters();
    check('clearFilters returns to zero active', activeFilterCount(store.getFilter()) === 0);

    // Sort cycling: asc -> desc -> unpinned, so relevance is reachable without
    // clearing the search box.
    store.setSort('id');
    check('setSort pins ascending first', store.getSort().direction === 'asc');
    store.setSort('id');
    check('setSort flips to descending', store.getSort().direction === 'desc');
    store.setSort('id');
    check('setSort unpins on the third click', store.getSort().column === null);

    // Subscribers.
    let fired = 0;
    const off = store.subscribe(() => fired++);
    store.setQuery('lodor');
    check('subscribers fire on change', fired === 1);
    off();
    store.setQuery('');
    check('unsubscribe stops delivery', fired === 1);

    // Arming.
    const tile = systems.find(s => String(s.id) === '18');
    store.arm(tile, 'once');
    check('arm records the tile', store.getArmed()?.id === '18');
    check('arm uppercases the id for the lookup', store.getArmed().id === String(tile.id).toUpperCase());
    check('isArmed agrees', store.isArmed() === true);
    check('"once" disarms after one placement', store.consumeArmed() === false && !store.isArmed());

    store.arm(tile, 'keep');
    check('"keep" stays armed', store.consumeArmed() === true && store.isArmed());
    check('"keep" stays armed indefinitely',
        store.consumeArmed() && store.consumeArmed() && store.isArmed());
    store.disarm();
    check('disarm clears it', !store.isArmed());

    store.arm(tile, 'count', 3);
    check('"count" reports its remaining', store.getArmed().remaining === 3);
    check('"count" survives the first placement', store.consumeArmed() === true);
    check('...and the second', store.consumeArmed() === true);
    check('...and disarms on the last', store.consumeArmed() === false && !store.isArmed());

    check('consumeArmed on nothing is safe', store.consumeArmed() === false);
    store.arm(null);
    check('arming nothing is a no-op', !store.isArmed());

    // Recent.
    store.noteRecent('18');
    store.noteRecent('19');
    store.noteRecent('18');
    check('recent is most-recent-first with no duplicates',
        store.getRecent().join(',') === '18,19', store.getRecent().join(','));
    for (let i = 0; i < 30; i++) store.noteRecent(`t${i}`);
    check('recent is capped', store.getRecent().length <= 12, `${store.getRecent().length}`);

    // hydrate() must survive garbage rather than leaving an unexplainable empty list.
    store.__resetForTest();
    check('hydrate() runs with no storage available', typeof store.hydrate() === 'object');
    check('hydrate() leaves a usable filter', activeFilterCount(store.getFilter()) === 0);

    // getViewSpec is the contract between the store and the pipeline.
    store.__resetForTest();
    store.setQuery('lodor');
    const viaStore = selectSystems(systems, store.getViewSpec()).results.length;
    const direct = selectSystems(systems, { filter: defaultFilter(), query: 'lodor', sort: {} }).results.length;
    check('getViewSpec drives the pipeline identically', viaStore === direct,
        `${viaStore} vs ${direct}`);

    store.__resetForTest();
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nsystem picker: ${passed} checks passed` +
    `, ${failures.length} failed` +
    ` (${systems.length} systems, ${MATRIX.length} filter states checked against the old logic)`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
