/**
 * What a system tile *is*, as far as the picker cares: which expansion it came from,
 * which attributes it has, and which columns can describe it.
 *
 * This file exists because the old picker had no such notion. Every filter was a
 * `document.getElementById('filter-' + key).dataset.active` read, so the answer to
 * "does this tile pass?" only existed while the popup was open, and the same ~45-line
 * block was copy-pasted four times to ask it (uiFilters.js:899, :1004, :1072, :1127).
 * Here the definitions are data and the predicates are pure, so the picker, the
 * AutoMapper and the Milty builder can all ask the same question and get the same
 * answer whether or not any UI exists.
 *
 * No DOM, no editor, no imports from the app — this module loads under node so the
 * filter algebra can be tested (tools/test-system-picker.js).
 */

// ── Sources ───────────────────────────────────────────────────────────────────
//
// These six groups partition the data: every system with a non-empty `source` lands
// in exactly one of them, and `other` mops up the ~20 long-tail sources (andcat,
// somno, fow, theodisi, codex3, …) that have no button of their own. The partition
// is load-bearing — tools/test-system-picker.js asserts it, so a new source value
// appearing when SystemInfo.json is resynced from the bot can't silently vanish.

export const SOURCE_GROUPS = [
    { key: 'base',  label: 'Base',            sources: ['base'] },
    { key: 'pok',   label: 'PoK',             sources: ['pok'] },
    { key: 'te',    label: "Thunder's Edge",  sources: ['thunders_edge'] },
    { key: 'ds',    label: 'DS/Uncharted',    sources: ['ds', 'uncharted_space'] },
    { key: 'eron',  label: 'Eronous',         sources: ['eronous'] },
    { key: 'other', label: 'Others',          catchAll: true }
];

/**
 * The group a system belongs to, or null when it has no source at all.
 *
 * Null means "no group claims it", and `passesFilter` drops those — matching the old
 * behaviour, where a system with `source: ''` failed every branch of the OR including
 * `sourceOthers` (uiFilters.js:930 tested `source !== ''`). All 671 systems currently
 * carry a source, so this is defensive rather than load-bearing.
 */
export function sourceGroupOf(sys) {
    const src = (sys.source || '').toLowerCase();
    if (!src) return null;
    for (const g of SOURCE_GROUPS) {
        if (g.sources && g.sources.includes(src)) return g.key;
    }
    return 'other';
}

// ── Attributes ────────────────────────────────────────────────────────────────
//
// Plain booleans, AND-ed together. An attribute absent from `filter.attrs` is not
// tested at all, so `test` here is the bare predicate — unlike the old FILTERS array,
// where every `test(sys, active)` had to open with `if (!a) return true;`.
//
// `group` drives the "+ Add filter" menu; anomalies stay separate from contents
// because dual-anomaly tiles exist and asking for "rift AND nebula" is legitimate.

export const ATTRIBUTES = [
    {
        key: 'hasWormhole', label: 'Has Wormhole', group: 'Contents',
        test: sys => wormholesOf(sys).length > 0
    },
    {
        key: 'hasTech', label: 'Has Tech', group: 'Contents',
        test: sys => (sys.planets || []).some(p =>
            (Array.isArray(p.techSpecialties) && p.techSpecialties.length > 0) || !!p.techSpecialty)
    },
    {
        key: 'isLegendary', label: 'Legendary', group: 'Contents',
        test: sys => (sys.planets || []).some(p => !!p.legendaryAbilityName)
    },
    { key: 'hasRift',      label: 'Has Rift',      group: 'Anomalies', test: sys => sys.isGravityRift === true },
    { key: 'hasNebula',    label: 'Has Nebula',    group: 'Anomalies', test: sys => sys.isNebula === true },
    { key: 'hasAsteroids', label: 'Has Asteroids', group: 'Anomalies', test: sys => sys.isAsteroidField === true },
    { key: 'hasSupernova', label: 'Has Supernova', group: 'Anomalies', test: sys => sys.isSupernova === true },
    { key: 'hasScar',      label: 'Has Scar',      group: 'Anomalies', test: sys => sys.isScar === true },
    { key: 'isFracture',   label: 'Fracture',      group: 'Tile',      test: sys => sys.tileBack === 'fracture' }
];

export const ATTRIBUTE_BY_KEY = new Map(ATTRIBUTES.map(a => [a.key, a]));

/**
 * Wormholes, normalized. The data ships an Array, but assignSystem stores a Set on
 * hexes and older test fixtures use either, so both are accepted. The `'null'` string
 * is a real value in SystemInfo.json and means "no wormhole".
 */
export function wormholesOf(sys) {
    const raw = sys.wormholes instanceof Set ? Array.from(sys.wormholes)
        : Array.isArray(sys.wormholes) ? sys.wormholes
            : [];
    return raw.filter(w => w && w !== 'null');
}

// ── Planet counts ─────────────────────────────────────────────────────────────
//
// OR-ed, not AND-ed. The old picker made these four independent AND filters, so
// clicking "1 Planet" and "2 Planets" together returned zero rows — never what anyone
// means. An empty list is no constraint.

export const PLANET_COUNTS = [
    { count: 0, label: 'No Planets' },
    { count: 1, label: '1 Planet' },
    { count: 2, label: '2 Planets' },
    { count: 3, label: '3 Planets' }
];

export function planetCountOf(sys) {
    return Array.isArray(sys.planets) ? sys.planets.length : 0;
}

// ── Tri-states ────────────────────────────────────────────────────────────────
//
// Three categories are exclusions rather than requirements, and a boolean can't say
// "don't care" about them. The old encoding was worse than incomplete: `weirdTiles`
// OFF didn't relax the filter, it *inverted* it to "show only weird tiles"
// (uiFilters.js:109), and the same shape at `showHyperlanes`. So the two reachable
// states were the two extremes and the useful middle was unreachable.
//
// 'hide' | 'only' | 'any'. Defaults reproduce the old defaults exactly:
//   weird:'hide'      == weirdTiles ON       hyperlanes:'hide' == showHyperlanes OFF
//   faction:'hide'    == noFaction ON

export const TRI_STATES = [
    { key: 'faction',    label: 'Faction homeworlds', hideLabel: 'No faction HW',  onlyLabel: 'Faction HW only' },
    { key: 'hyperlanes', label: 'Hyperlanes',         hideLabel: 'No hyperlanes',  onlyLabel: 'Hyperlanes only' },
    { key: 'weird',      label: 'Weird tiles',        hideLabel: 'No weird tiles', onlyLabel: 'Weird tiles only' }
];

export const TRI_VALUES = ['hide', 'only', 'any'];

export function hasFactionHomeworld(sys) {
    return (sys.planets || []).some(p => !!p.factionHomeworld);
}

/**
 * FOW/blank/placeholder tiles that shouldn't normally be placeable.
 *
 * The pattern is carried over verbatim from uiFilters.js:108, including the fact that
 * `Prison` can never match — it is tested against an already-lowercased string. That
 * is a real (harmless) defect, kept because tools/test-system-picker.js asserts this
 * predicate agrees with the old one tile-for-tile; changing it is a separate decision
 * with its own test, not a silent drive-by.
 */
export function isWeirdTile(sys) {
    const txt = `${sys.id} ${sys.name}`.toLowerCase();
    return /fow|blank|-1|Prison|0b|0g|0r|0gray|0border/.test(txt);
}

// ── Columns ───────────────────────────────────────────────────────────────────

export const COLUMNS = [
    { key: 'tile',        label: 'Tile',    defaultVisible: true,  width: '50px' },
    { key: 'id',          label: 'ID',      defaultVisible: true,  width: '60px' },
    { key: 'name',        label: 'Name',    defaultVisible: true,  width: '140px' },
    { key: 'planets',     label: 'Planets', defaultVisible: true,  width: '60px' },
    { key: 'planetTypes', label: 'Types',   defaultVisible: true,  width: '50px' },
    { key: 'resources',   label: 'Res',     defaultVisible: true,  width: '40px' },
    { key: 'influence',   label: 'Inf',     defaultVisible: true,  width: '40px' },
    { key: 'effective',   label: 'Eff R/I', defaultVisible: true,  width: '60px' },
    { key: 'wormholes',   label: 'Worm',    defaultVisible: true,  width: '50px' },
    { key: 'tech',        label: 'Tech',    defaultVisible: true,  width: '50px' },
    { key: 'legendary',   label: 'Legend',  defaultVisible: true,  width: '50px' },
    { key: 'anomalies',   label: 'Effect',  defaultVisible: true,  width: '50px' },
    { key: 'fracture',    label: 'Fracture', defaultVisible: false, width: '50px' },
    { key: 'used',        label: 'Used',    defaultVisible: false, width: '50px' }
];

export function defaultColumnVisibility() {
    const out = {};
    for (const col of COLUMNS) out[col.key] = col.defaultVisible;
    return out;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

/** A fresh filter state, equivalent to the old buttons' `defaultOn` flags. */
export function defaultFilter() {
    const sources = {};
    for (const g of SOURCE_GROUPS) sources[g.key] = true;
    return {
        sources,
        attrs: {},
        planetCounts: [],
        tri: { faction: 'hide', hyperlanes: 'hide', weird: 'hide' },
        mode: 'and',
        unplacedOnly: false
    };
}

// ── Derived values shared by the views and the sorters ─────────────────────────

export function totalResources(sys) {
    return (sys.planets || []).reduce((sum, p) => sum + (p.resources || 0), 0);
}

export function totalInfluence(sys) {
    return (sys.planets || []).reduce((sum, p) => sum + (p.influence || 0), 0);
}

/**
 * "Effective" resources/influence: a planet only counts toward the stat it is better
 * at, and counts toward both when equal — the standard way TI4 players value a tile.
 */
export function effectiveValue(sys) {
    let res = 0, inf = 0, flex = 0;
    for (const p of sys.planets || []) {
        const r = p.resources || 0, i = p.influence || 0;
        if (r === i) flex += r;
        else if (r > i) res += r;
        else inf += i;
    }
    return { res, inf, flex, total: res + inf + flex };
}

export function techsOf(sys) {
    return Array.from(new Set((sys.planets || []).flatMap(p => p.techSpecialties || []).filter(Boolean)));
}

/**
 * Planet types, tolerating both shapes in the data: `planetType` (string, 382 planets)
 * and `planetTypes` (array, 145). Planets carrying neither are counted as NEUTRAL.
 */
export function planetTypesOf(sys) {
    const types = new Set();
    let untyped = false;
    for (const p of sys.planets || []) {
        if (typeof p.planetType === 'string' && p.planetType) {
            types.add(p.planetType.toUpperCase());
        } else if (Array.isArray(p.planetTypes) && p.planetTypes.length > 0) {
            p.planetTypes.forEach(t => { if (t) types.add(t.toUpperCase()); });
        } else {
            untyped = true;
        }
    }
    if (untyped) types.add('NEUTRAL');
    return types;
}

export const ANOMALY_FLAGS = [
    { key: 'supernova', flag: 'isSupernova',     label: 'Supernova',      emoji: '☀️' },
    { key: 'gravity',   flag: 'isGravityRift',   label: 'Gravity Rift',   emoji: '🕳️' },
    { key: 'nebula',    flag: 'isNebula',        label: 'Nebula',         emoji: '☁️' },
    { key: 'asteroid',  flag: 'isAsteroidField', label: 'Asteroid Field', emoji: '🪨' },
    { key: 'scar',      flag: 'isScar',          label: 'Entropic Scar',  emoji: '☄️' }
];

export function anomaliesOf(sys) {
    return ANOMALY_FLAGS.filter(a => sys[a.flag] === true);
}
