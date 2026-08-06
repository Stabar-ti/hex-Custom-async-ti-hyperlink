/**
 * The one place the app answers "which tiles are selectable right now".
 *
 * Before this, four separate copies of the same ~45-line block answered it — applyFilters,
 * refreshSystemList, getActiveFilterPass and passesAutoMapperFilters (uiFilters.js:899,
 * :1004, :1072, :1127) — each reading filter state back out of button elements. They had
 * already drifted: one applied AND/NAND and the others silently forced AND, and one of
 * them computed its whole result and then discarded it.
 *
 * `passesFilter` replaces all four. It takes a plain filter object, so the AutoMapper and
 * the Milty builder can ask with the picker closed — which they could not do before.
 *
 * No DOM — this module loads under node for tools/test-system-picker.js.
 */

import {
    ATTRIBUTES, ATTRIBUTE_BY_KEY, sourceGroupOf, planetCountOf,
    hasFactionHomeworld, isWeirdTile, defaultFilter
} from './pickerModel.js';
import { parseQuery, matchesQuery, isEmptyQuery, sortSystems, sortByRelevance } from './pickerQuery.js';

// ── Tri-state helpers ─────────────────────────────────────────────────────────

/** Applies one 'hide' | 'only' | 'any' rule to a boolean property of a tile. */
function passesTri(value, has) {
    if (value === 'only') return has;
    if (value === 'any') return true;
    return !has;               // 'hide', and the default for anything unrecognised
}

// ── The predicate ─────────────────────────────────────────────────────────────

/**
 * Does this system pass the given filter?
 *
 * Order matters only for speed: sources reject the most tiles for the least work, then
 * the tri-states, then the attribute tests which walk the planet list.
 *
 * @param {object} sys     a system from SystemInfo.json
 * @param {object} filter  see pickerModel.defaultFilter()
 * @param {{isUsed?: (id: string) => boolean}} [opts]  needed only for `unplacedOnly`
 */
export function passesFilter(sys, filter, opts = {}) {
    const f = filter || defaultFilter();

    // 1. Source (OR across the six groups). No active source shows nothing, which is
    //    the old behaviour and is at least legible in the UI as "0 of 671".
    const group = sourceGroupOf(sys);
    if (!group || !f.sources || !f.sources[group]) return false;

    // 2. Tri-state exclusions. These are not part of the AND/NAND set: NAND means
    //    "show me tiles that fail one of my *requirements*", and "show weird tiles I
    //    asked to hide" is never what that means.
    const tri = f.tri || {};
    if (!passesTri(tri.faction, hasFactionHomeworld(sys))) return false;
    if (!passesTri(tri.hyperlanes, !!sys.isHyperlane)) return false;
    if (!passesTri(tri.weird, isWeirdTile(sys))) return false;

    // 3. Planet counts, OR-ed. Empty means no constraint.
    const counts = f.planetCounts || [];
    if (counts.length && !counts.includes(planetCountOf(sys))) return false;

    // 4. Already-placed tiles, when asked. Driven by the used-ID map rather than by
    //    comparing a system id against a hex label — that comparison was what made
    //    tiles 101-106 vanish from the list on any map with a populated inner ring.
    if (f.unplacedOnly && opts.isUsed && opts.isUsed(sys.id)) return false;

    // 5. Attributes, AND-ed (or NAND-ed). Only the ones actually switched on are tested.
    const active = ATTRIBUTES.filter(a => f.attrs && f.attrs[a.key]);
    if (!active.length) return true;

    const results = active.map(a => a.test(sys));
    return f.mode === 'nand' ? results.some(r => !r) : results.every(r => r);
}

// ── The pipeline ──────────────────────────────────────────────────────────────

/**
 * Filter → search → sort, plus the counts the UI needs to explain itself.
 *
 * The counts are the reason this returns an object rather than an array: a picker that
 * shows an empty list without saying "359 hidden by filters" is the single most common
 * way people get stuck in it.
 *
 * @param {object[]} systems
 * @param {{filter?: object, query?: string, sort?: {column, direction}}} view
 * @param {{isUsed?: (id: string) => boolean}} [opts]
 * @returns {{results: object[], parsed: object, counts: object}}
 */
export function selectSystems(systems, view = {}, opts = {}) {
    const all = Array.isArray(systems) ? systems : [];
    const filter = view.filter || defaultFilter();
    const parsed = parseQuery(view.query || '');
    const sort = view.sort || {};

    const filtered = all.filter(sys => passesFilter(sys, filter, opts));
    const searched = isEmptyQuery(parsed) ? filtered : filtered.filter(sys => matchesQuery(sys, parsed));

    // With no pinned column, a query ranks by relevance and an empty box keeps file
    // order — which is roughly canonical tile order and carries real meaning.
    let results;
    if (sort.column) {
        results = sortSystems(searched, sort.column, sort.direction, opts);
    } else if (!isEmptyQuery(parsed)) {
        results = sortByRelevance(searched, parsed);
    } else {
        results = searched.slice();
    }

    const isUsed = opts.isUsed || (() => false);
    return {
        results,
        parsed,
        counts: {
            total: all.length,
            afterFilter: filtered.length,
            afterSearch: searched.length,
            used: results.reduce((n, s) => n + (isUsed(s.id) ? 1 : 0), 0),
            hiddenByFilter: all.length - filtered.length,
            hiddenBySearch: filtered.length - searched.length
        }
    };
}

// ── Filter summaries, for the chip strip ──────────────────────────────────────

/**
 * How many filters are switched on relative to the defaults. Drives whether the
 * "Clear" affordance is worth showing.
 */
export function activeFilterCount(filter) {
    const f = filter || defaultFilter();
    const base = defaultFilter();
    let n = 0;

    for (const key of Object.keys(base.sources)) {
        if (!f.sources?.[key]) n++;             // a source switched *off* is a filter
    }
    n += ATTRIBUTES.filter(a => f.attrs?.[a.key]).length;
    n += (f.planetCounts || []).length ? 1 : 0;
    for (const key of Object.keys(base.tri)) {
        if ((f.tri?.[key] ?? base.tri[key]) !== base.tri[key]) n++;
    }
    if (f.unplacedOnly) n++;
    return n;
}

/**
 * The active filters as removable chips: `{ kind, key, label, title }`.
 * The view renders these; it doesn't need to know the filter's shape.
 */
export function describeActiveFilters(filter) {
    const f = filter || defaultFilter();
    const base = defaultFilter();
    const chips = [];

    for (const a of ATTRIBUTES) {
        if (f.attrs?.[a.key]) {
            chips.push({ kind: 'attr', key: a.key, label: a.label, title: `${a.group}: ${a.label}` });
        }
    }

    const counts = (f.planetCounts || []).slice().sort((x, y) => x - y);
    if (counts.length) {
        chips.push({
            kind: 'planetCounts', key: 'planetCounts',
            label: counts.length === 1 ? `${counts[0]} planets` : `${counts.join('/')} planets`,
            title: 'Planet count (any of these)'
        });
    }

    for (const key of Object.keys(base.tri)) {
        const value = f.tri?.[key] ?? base.tri[key];
        if (value !== base.tri[key]) {
            chips.push({ kind: 'tri', key, value, label: `${key}: ${value}`, title: `${key} = ${value}` });
        }
    }

    if (f.unplacedOnly) {
        chips.push({ kind: 'unplacedOnly', key: 'unplacedOnly', label: 'Unplaced only', title: 'Hide tiles already on the map' });
    }

    return chips;
}

// ── The AutoMapper / Milty projection ─────────────────────────────────────────

/**
 * The filter the auto-placers should use, derived from whatever the user has set in
 * the picker: their source and faction choices are respected, but weird tiles and
 * hyperlanes are forced off no matter what the UI says — a FOW or blank tile dropped
 * into a generated map is always a bug, never a request.
 *
 * Attributes and planet counts are dropped: those describe "what am I browsing for",
 * not "what may be placed automatically".
 */
export function autoMapperFilter(filter) {
    const f = filter || defaultFilter();
    const base = defaultFilter();
    return {
        ...base,
        sources: { ...base.sources, ...(f.sources || {}) },
        attrs: {},
        planetCounts: [],
        tri: {
            faction: f.tri?.faction ?? base.tri.faction,
            hyperlanes: 'hide',
            weird: 'hide'
        },
        mode: 'and',
        unplacedOnly: false
    };
}

export { ATTRIBUTE_BY_KEY };
