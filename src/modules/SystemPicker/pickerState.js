/**
 * What the picker is currently showing, and what tile is armed for placement.
 *
 * This replaces the DOM as the picker's memory. Filters used to live as `dataset.active`
 * on twenty-one button elements, which meant the state was destroyed every time the popup
 * closed — reopening always dropped you back to defaults mid-task — and that anything
 * wanting to know the filters had to reach into the picker's markup and hope it was open.
 * The AutoMapper still does exactly that (autoBuilderCore.js:138).
 *
 * Views subscribe and re-render; they never read each other's element ids. Everything
 * except `armed` persists, so closing the popup to look at the map is free.
 *
 * Deliberately NOT stored on `editor`: this is how one person is browsing right now, not
 * part of the map, and it must never reach a save file. Same reasoning as
 * loreOverlay._filter.
 *
 * No DOM at module scope — this imports cleanly under node so the reducers can be tested.
 */

import { defaultFilter, defaultColumnVisibility, ATTRIBUTE_BY_KEY, TRI_VALUES } from './pickerModel.js';

const STORAGE_KEY = 'ti4-system-picker';
// Column visibility keeps its original key so nobody's existing column setup resets.
const COLUMN_KEY = 'ti4-column-visibility';

const RECENT_LIMIT = 12;

// Text scale bounds. Below 0.8 the tile badges stop being legible; above 1.6 a grid cell
// can no longer fit a tile name on one line.
export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 1.6;
export const TEXT_SCALE_STEP = 0.1;

const state = {
    filter: defaultFilter(),
    query: '',
    sort: { column: null, direction: null },  // no column = relevance when searching, file order otherwise
    view: 'grid',                             // 'grid' | 'table'
    columns: defaultColumnVisibility(),
    textScale: 1,                             // multiplier on the picker's whole type scale
    armed: null,                              // { id, name, system, mode, remaining } — never persisted
    recent: []                                // ids, most recent first
};

let listeners = [];

export function subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    persist();
    for (const fn of listeners.slice()) fn(state);
}

/** Notify without persisting — for the armed tile, which is per-session by design. */
function notifyOnly() {
    for (const fn of listeners.slice()) fn(state);
}

// ── Persistence ───────────────────────────────────────────────────────────────

function persist() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            filter: state.filter,
            query: state.query,
            sort: state.sort,
            view: state.view,
            textScale: state.textScale,
            recent: state.recent
        }));
        localStorage.setItem(COLUMN_KEY, JSON.stringify(state.columns));
    } catch { /* private mode / storage disabled — the picker just forgets between sessions */ }
}

/**
 * Restores the stored view. Called once at install.
 *
 * Everything is merged onto a fresh default rather than trusted wholesale, so a stored
 * blob written by an older version — or hand-edited, or truncated — can't leave the
 * picker in a state with no valid sources and an empty list nobody can explain.
 */
export function hydrate() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch { /* unparseable: fall through to defaults */ }

    if (stored && typeof stored === 'object') {
        const base = defaultFilter();
        const f = stored.filter || {};

        state.filter = {
            ...base,
            sources: { ...base.sources, ...(typeof f.sources === 'object' ? f.sources : {}) },
            // Drop attribute keys that no longer exist, so a removed filter can't
            // permanently hide tiles with no chip to explain why.
            attrs: Object.fromEntries(
                Object.entries(f.attrs || {}).filter(([k, v]) => v && ATTRIBUTE_BY_KEY.has(k))),
            planetCounts: Array.isArray(f.planetCounts) ? f.planetCounts.filter(n => Number.isInteger(n)) : [],
            tri: {
                faction: TRI_VALUES.includes(f.tri?.faction) ? f.tri.faction : base.tri.faction,
                hyperlanes: TRI_VALUES.includes(f.tri?.hyperlanes) ? f.tri.hyperlanes : base.tri.hyperlanes,
                weird: TRI_VALUES.includes(f.tri?.weird) ? f.tri.weird : base.tri.weird
            },
            mode: f.mode === 'nand' ? 'nand' : 'and',
            unplacedOnly: !!f.unplacedOnly
        };

        // A stored state with every source off renders an empty picker that looks broken.
        if (!Object.values(state.filter.sources).some(Boolean)) {
            state.filter.sources = base.sources;
        }

        state.query = typeof stored.query === 'string' ? stored.query : '';
        state.sort = {
            column: typeof stored.sort?.column === 'string' ? stored.sort.column : null,
            direction: stored.sort?.direction === 'desc' ? 'desc' : (stored.sort?.direction === 'asc' ? 'asc' : null)
        };
        state.view = stored.view === 'table' ? 'table' : 'grid';
        state.textScale = clampScale(stored.textScale);
        state.recent = Array.isArray(stored.recent) ? stored.recent.slice(0, RECENT_LIMIT) : [];
    }

    try {
        const cols = JSON.parse(localStorage.getItem(COLUMN_KEY) || 'null');
        if (cols && typeof cols === 'object') state.columns = { ...defaultColumnVisibility(), ...cols };
    } catch { /* keep defaults */ }

    return state;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getState() { return state; }
export function getFilter() { return state.filter; }
export function getQuery() { return state.query; }
export function getSort() { return state.sort; }
export function getView() { return state.view; }
export function getColumns() { return state.columns; }

/** The view descriptor `selectSystems` expects. */
export function getViewSpec() {
    return { filter: state.filter, query: state.query, sort: state.sort };
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function setFilter(patch) {
    state.filter = { ...state.filter, ...patch };
    notify();
}

export function toggleSource(key) {
    const sources = { ...state.filter.sources, [key]: !state.filter.sources[key] };
    state.filter = { ...state.filter, sources };
    notify();
}

export function setSourcesAll(on) {
    const sources = {};
    for (const key of Object.keys(state.filter.sources)) sources[key] = !!on;
    state.filter = { ...state.filter, sources };
    notify();
}

export function toggleAttr(key) {
    const attrs = { ...state.filter.attrs };
    if (attrs[key]) delete attrs[key]; else attrs[key] = true;
    state.filter = { ...state.filter, attrs };
    notify();
}

export function setAttr(key, on) {
    const attrs = { ...state.filter.attrs };
    if (on) attrs[key] = true; else delete attrs[key];
    state.filter = { ...state.filter, attrs };
    notify();
}

export function togglePlanetCount(n) {
    const has = state.filter.planetCounts.includes(n);
    const planetCounts = has
        ? state.filter.planetCounts.filter(x => x !== n)
        : [...state.filter.planetCounts, n].sort((a, b) => a - b);
    state.filter = { ...state.filter, planetCounts };
    notify();
}

export function setPlanetCounts(list) {
    state.filter = { ...state.filter, planetCounts: (list || []).slice().sort((a, b) => a - b) };
    notify();
}

export function setTri(key, value) {
    if (!TRI_VALUES.includes(value)) return;
    state.filter = { ...state.filter, tri: { ...state.filter.tri, [key]: value } };
    notify();
}

/** Steps a tri-state through hide → only → any → hide, for click-to-cycle chips. */
export function cycleTri(key) {
    const current = state.filter.tri[key];
    const next = TRI_VALUES[(TRI_VALUES.indexOf(current) + 1) % TRI_VALUES.length];
    setTri(key, next);
}

export function setMode(mode) {
    state.filter = { ...state.filter, mode: mode === 'nand' ? 'nand' : 'and' };
    notify();
}

export function setUnplacedOnly(on) {
    state.filter = { ...state.filter, unplacedOnly: !!on };
    notify();
}

/** Back to defaults. Does not touch the search box — clearing filters and clearing a
 *  search are different intentions and the UI offers them separately. */
export function clearFilters() {
    state.filter = defaultFilter();
    notify();
}

// ── Search, sort, view ────────────────────────────────────────────────────────

export function setQuery(q) {
    state.query = q || '';
    notify();
}

/**
 * Pins a sort column. Passing the already-active column flips the direction, and
 * flipping past 'desc' unpins it — which is how you get back to relevance ordering
 * without clearing the search.
 */
export function setSort(column, direction) {
    if (direction === undefined) {
        if (state.sort.column !== column) direction = 'asc';
        else if (state.sort.direction === 'asc') direction = 'desc';
        else { column = null; direction = null; }
    }
    state.sort = { column: column || null, direction: column ? (direction || 'asc') : null };
    notify();
}

export function setView(view) {
    state.view = view === 'table' ? 'table' : 'grid';
    notify();
}

/** Rounds to the nearest step and clamps; anything unparseable falls back to 1. */
function clampScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    const stepped = Math.round(n / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
    return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Number(stepped.toFixed(2))));
}

export function getTextScale() { return state.textScale; }

export function setTextScale(value) {
    const next = clampScale(value);
    if (next === state.textScale) return;
    state.textScale = next;
    notify();
}

/** Nudges the scale by whole steps, for the +/- buttons. */
export function stepTextScale(direction) {
    setTextScale(state.textScale + direction * TEXT_SCALE_STEP);
}

export function resetTextScale() {
    setTextScale(1);
}

export function setColumnVisible(key, on) {
    state.columns = { ...state.columns, [key]: !!on };
    notify();
}

// ── Arming ────────────────────────────────────────────────────────────────────
//
// The armed tile is the picker's one piece of genuinely modal state: while it is set,
// clicking the map places rather than paints. It is not persisted — coming back to a
// reloaded page silently armed would be a nasty surprise.

/**
 * @param {object} system  the system to place
 * @param {'once'|'keep'|'count'} mode
 * @param {number} [count] how many placements, for mode 'count'
 */
export function arm(system, mode = 'once', count = 1) {
    if (!system) return;
    state.armed = {
        id: String(system.id).toUpperCase(),
        name: system.name || '',
        system,
        mode: mode === 'keep' || mode === 'count' ? mode : 'once',
        remaining: mode === 'count' ? Math.max(1, count | 0) : null
    };
    notifyOnly();
}

export function disarm() {
    if (!state.armed) return;
    state.armed = null;
    notifyOnly();
}

export function getArmed() { return state.armed; }
export function isArmed() { return state.armed !== null; }

/**
 * Records one placement and returns whether the tile is still armed.
 * 'once' disarms immediately, 'keep' never does, 'count' counts down to zero.
 */
export function consumeArmed() {
    const armed = state.armed;
    if (!armed) return false;

    if (armed.mode === 'keep') { notifyOnly(); return true; }
    if (armed.mode === 'count') {
        const remaining = armed.remaining - 1;
        if (remaining > 0) {
            state.armed = { ...armed, remaining };
            notifyOnly();
            return true;
        }
    }
    state.armed = null;
    notifyOnly();
    return false;
}

/** Changes the mode of the already-armed tile, so the banner's Once/Keep/xN is live. */
export function setArmedMode(mode, count = 1) {
    if (!state.armed) return;
    state.armed = {
        ...state.armed,
        mode: mode === 'keep' || mode === 'count' ? mode : 'once',
        remaining: mode === 'count' ? Math.max(1, count | 0) : null
    };
    notifyOnly();
}

// ── Recent ────────────────────────────────────────────────────────────────────

export function noteRecent(id) {
    if (id == null) return;
    const key = String(id).toUpperCase();
    state.recent = [key, ...state.recent.filter(x => x !== key)].slice(0, RECENT_LIMIT);
    notify();
}

export function getRecent() { return state.recent; }

export function clearRecent() {
    state.recent = [];
    notify();
}

// ── Testing seam ──────────────────────────────────────────────────────────────

/** Resets to defaults without touching storage. Used by tools/test-system-picker.js. */
export function __resetForTest() {
    state.filter = defaultFilter();
    state.query = '';
    state.sort = { column: null, direction: null };
    state.view = 'grid';
    state.columns = defaultColumnVisibility();
    state.textScale = 1;
    state.armed = null;
    state.recent = [];
    listeners = [];
}
