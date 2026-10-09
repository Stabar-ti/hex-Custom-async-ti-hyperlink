// @ts-check
/**
 * The Milty value of a tile and of a slice — one formula, one set of weights.
 *
 * WHY THIS EXISTS
 *
 * The same calculation used to live in three places, each with its own weight table:
 * the Milty generator (miltyBuilderRandomTool.calculateSliceScore), the Milty home overlay
 * (a copy commented "replicates … exactly") and the AutoMapper's Balanced mode. A fourth
 * table sat unused in miltyRandomToolUI. They had drifted: the AutoMapper's scored a
 * legendary at 5 against the generator's 1.5, and the unused one had supernova at −5.
 * The overlay and the generator disagreed about what a trade station is. And the
 * AutoMapper's copy read `techSpecialty`, a field no planet in the data has, so Balanced
 * mode never counted a tech skip. Meanwhile the AutoMapper's value tiers and the value
 * overlay ranked tiles by a fifth formula of their own. Everything reads this module now.
 *
 * TILE VALUE AND SLICE SCORE
 *
 * Almost every term is a property of one tile — its planets, skips, wormholes, anomaly —
 * so a tile has a value of its own, and a slice's score is its tiles' values added up plus
 * the two terms that only mean something for a whole slice:
 *
 *   - R/I imbalance. A 3/0 tile is not worse for being lopsided: next to a 0/3 it makes a
 *     balanced slice. So imbalance is measured on the slice, never charged to a tile.
 *   - Planet count, below 3 or above 5. A property of a slice by definition.
 *
 * That split is exact: sliceScore(tiles).score is the sum of tileScore(t).value plus those
 * two terms, so a tile's value is precisely its share of any slice it is in. The
 * AutoMapper's tiers rank tiles by that share.
 *
 * OPTIMAL RESOURCES AND INFLUENCE
 *
 * Each planet is spent on whichever of R and I it is better at. A planet better at
 * resources counts its resources as R, one better at influence counts its influence as I,
 * and one with the two equal counts that number as F, flex — so a 2/1, a 1/2 and a 1/1 are
 * R/I/F 2/2/1. Flex is worth the average of the R and I weights, since it can go either
 * way. The generator used to score raw totals instead, which counted a 2/2 as 2 resources
 * AND 2 influence — both of which the planet cannot give at once.
 *
 * Imbalance follows the same logic: flex is spent to close the gap first, so a slice's
 * imbalance is |R − I| less its flex, never below zero.
 *
 * No DOM at module scope — tools/test-milty-score.js loads this under node.
 */

/** @typedef {Record<string, number>} Weights */

/**
 * The default weights. The generator's table, which the Weighting Settings popup edits.
 * @type {Readonly<Weights>}
 */
export const DEFAULT_WEIGHTS = Object.freeze({
    // Anomalies
    supernova: -3,
    asteroidField: -1,
    nebula: 0,
    gravityRift: -1,
    entropicScar: 1,

    // Resources / influence, per optimal point
    resourceValue: 0.9,
    influenceValue: 1,

    // Special features
    techSpecialty: 2,
    legendaryPlanet: 1.5,     // any legendary planet not named below
    legendaryIndustrex: 2.5,  // Industrex (TE)
    legendaryEmelpar: 3,      // Emelpar (TE)
    wormhole: 0.5,            // any wormhole but gamma
    gammaWormhole: 1.5,
    tradeStation: 0.5,

    // Planet traits
    industrial: 0.5,
    cultural: 0.5,
    hazardous: 0.5,

    // Slice-only
    resourceInfluenceImbalance: -0.5,
    lowPlanetCount: -3,
    highPlanetCount: -1,
});

/** Anomaly weight keys, and the system flag each one reads. */
const ANOMALIES = /** @type {const} */ ([
    ['supernova', 'isSupernova'],
    ['asteroidField', 'isAsteroidField'],
    ['nebula', 'isNebula'],
    ['gravityRift', 'isGravityRift'],
    ['entropicScar', 'isScar'],
]);

// ── The weight store ─────────────────────────────────────────────────────────
//
// Weights edited in the Weighting Settings popup used to live in module memory only, so a
// reload silently put the defaults back. They are saved now. Storage can be missing or
// throw (a private window, blocked site data, node), and then the defaults are simply used.

const STORAGE_KEY = 'ti4.miltyWeights';

/** @type {Weights} */
let weights = load();
/** @type {Array<(w: Weights) => void>} */
let listeners = [];

/** @returns {Weights} */
function load() {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_WEIGHTS };
        const saved = JSON.parse(raw);
        const out = { ...DEFAULT_WEIGHTS };
        // Only known keys, and only numbers — a stale or hand-edited entry cannot poison it.
        for (const k of Object.keys(DEFAULT_WEIGHTS)) {
            if (typeof saved?.[k] === 'number' && Number.isFinite(saved[k])) out[k] = saved[k];
        }
        return out;
    } catch {
        return { ...DEFAULT_WEIGHTS };
    }
}

function save() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(weights)); } catch { /* unsaved */ }
}

function notify() {
    for (const fn of listeners.slice()) fn(getWeights());
}

/** A copy of the current weights. */
export function getWeights() {
    return { ...weights };
}

/** Replaces the current weights (unknown keys are ignored), saves them and tells listeners. */
export function setWeights(next) {
    const out = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
        const v = Number(next?.[k]);
        out[k] = Number.isFinite(v) ? v : weights[k];
    }
    weights = out;
    save();
    notify();
}

export function resetWeights() {
    weights = { ...DEFAULT_WEIGHTS };
    save();
    notify();
}

/**
 * @param {(w: Weights) => void} fn  called with the new weights whenever they change
 * @returns {() => void} unsubscribe
 */
export function subscribeWeights(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
}

/** Drops listeners and restores the defaults, without touching storage. */
export function __resetForTest() {
    weights = { ...DEFAULT_WEIGHTS };
    listeners = [];
}

/**
 * The weights with the R / I / T bias applied: the value hints' R, I and T toggles scale
 * the resource, influence and tech weights. `factors` are valueOverlay.getFactors' — 1, 1
 * and 2 unbiased — so each is read relative to that.
 *
 * @param {Weights} w
 * @param {{f_R?: number, f_I?: number, f_T?: number}} [factors]
 */
export function biasedWeights(w, { f_R = 1, f_I = 1, f_T = 2 } = {}) {
    return {
        ...w,
        resourceValue: w.resourceValue * f_R,
        influenceValue: w.influenceValue * f_I,
        techSpecialty: w.techSpecialty * (f_T / 2),
    };
}

/** The weight a flex point carries: the average of the R and I weights. */
export function flexWeightOf(w) {
    return (w.resourceValue + w.influenceValue) / 2;
}

// ── Reading a tile ───────────────────────────────────────────────────────────

/** Every planet type a planet carries, upper-cased. The data uses either field. */
function planetTypes(p) {
    const out = [];
    if (typeof p.planetType === 'string' && p.planetType) out.push(p.planetType.toUpperCase());
    if (Array.isArray(p.planetTypes)) for (const t of p.planetTypes) if (t) out.push(String(t).toUpperCase());
    return out;
}

/** Tech skips on a planet, of any kind. */
function skipsOf(p) {
    const out = [];
    if (p.techSpecialty) out.push(p.techSpecialty);
    if (Array.isArray(p.techSpecialties)) out.push(...p.techSpecialties.filter(Boolean));
    return out;
}

/**
 * Whether a planet is a trade station. The data has no flag for it, so a planet whose name
 * says "station" is one — Tsion Station and Oluz Station — as the generator always read it.
 */
export function isTradeStation(p) {
    return p.isTradeStation === true || p.isStation === true || /station/i.test(String(p.name || ''));
}

/**
 * What a map hex holds, in the shape of a system record, for scoring a slice on the map.
 *
 * A placed tile's own planets and wormholes are copied onto its hex when it is assigned,
 * with any wormholes added by hand. Anomalies are gathered from three places, because each
 * can hold one the others do not: the tile's own flags, effects painted onto the hex, and
 * anomaly tokens — which is how the AutoMapper draws an anomaly it had no tile for.
 *
 * @param {any} hex
 * @param {any} [sys]  the placed system's record, if known
 */
export function hexAsTile(hex, sys = null) {
    const effects = new Set([...(hex?.effects || [])].map(e => String(e).toLowerCase()));
    const tokens = new Set((hex?.systemTokens || []).map(t => String(t).toLowerCase()));
    const has = (flag, effect, token) => !!sys?.[flag] || effects.has(effect) || tokens.has(token);
    return {
        id: hex?.realId ?? sys?.id ?? null,
        planets: Array.isArray(hex?.planets) ? hex.planets : (sys?.planets || []),
        wormholes: hex?.wormholes ? [...hex.wormholes] : (sys?.wormholes || []),
        isSupernova: has('isSupernova', 'supernova', 'supernova'),
        isAsteroidField: has('isAsteroidField', 'asteroid', 'asteroids'),
        isNebula: has('isNebula', 'nebula', 'nebula'),
        isGravityRift: has('isGravityRift', 'rift', 'gravityrift'),
        isScar: has('isScar', 'scar', 'entropicscar'),
    };
}

/**
 * A tile's Milty value, and every piece of it.
 *
 * `parts` are the counts — how many optimal resources, how many skips, which anomalies.
 * `terms` are what each is worth under `w`, and add up to `value` exactly. The pool view
 * shows both, so a tier can be traced back to the planets and features that earned it.
 *
 * @param {any} sys  a system record, or hexAsTile of a map hex
 * @param {Weights} [w]
 */
export function tileScore(sys, w = weights) {
    const planets = Array.isArray(sys?.planets) ? sys.planets : [];
    let r = 0, i = 0, flex = 0, tech = 0, traits = 0, stations = 0;
    const legendaries = [];
    const traitCounts = { industrial: 0, cultural: 0, hazardous: 0 };

    for (const p of planets) {
        const res = p.resources || 0;
        const inf = p.influence || 0;
        if (res > inf) r += res;
        else if (inf > res) i += inf;
        else flex += res;

        tech += skipsOf(p).length;
        if (p.legendaryAbilityName) legendaries.push(String(p.name || p.legendaryAbilityName).toLowerCase());
        if (isTradeStation(p)) stations++;
        const types = planetTypes(p);
        for (const k of /** @type {const} */ (['industrial', 'cultural', 'hazardous'])) {
            if (types.includes(k.toUpperCase())) { traitCounts[k]++; traits++; }
        }
    }

    const wormholes = (sys?.wormholes || []).map(x => String(x).toLowerCase()).filter(x => x && x !== 'null');
    const gamma = wormholes.filter(x => x === 'gamma').length;
    const anomalies = ANOMALIES.filter(([, flag]) => sys?.[flag]).map(([key]) => key);

    const legendaryWeight = name => name.includes('industrex') ? w.legendaryIndustrex
        : name.includes('emelpar') ? w.legendaryEmelpar : w.legendaryPlanet;

    const terms = {
        r: r * w.resourceValue,
        i: i * w.influenceValue,
        flex: flex * flexWeightOf(w),
        tech: tech * w.techSpecialty,
        legendary: legendaries.reduce((s, n) => s + legendaryWeight(n), 0),
        wormhole: (wormholes.length - gamma) * w.wormhole + gamma * w.gammaWormhole,
        station: stations * w.tradeStation,
        traits: traitCounts.industrial * w.industrial + traitCounts.cultural * w.cultural
            + traitCounts.hazardous * w.hazardous,
        anomaly: anomalies.reduce((s, k) => s + (w[k] || 0), 0),
    };
    const value = Object.values(terms).reduce((s, v) => s + v, 0);

    return {
        parts: {
            r, i, flex, tech, planets: planets.length,
            legendaries, wormholes, stations, traits, traitCounts, anomalies,
        },
        terms,
        value,
    };
}

/**
 * A slice's Milty score: its tiles' values, plus the two slice-only terms.
 *
 * @param {any[]} tiles  system records, or hexAsTile of map hexes
 * @param {Weights} [w]
 */
export function sliceScore(tiles, w = weights) {
    const scored = tiles.map(t => tileScore(t, w));
    const sum = key => scored.reduce((s, t) => s + t.parts[key], 0);
    const r = sum('r'), i = sum('i'), flex = sum('flex'), planets = sum('planets');
    const tileTotal = scored.reduce((s, t) => s + t.value, 0);

    // Flex closes the gap first: 5 R, 2 I and 2 flex is one point out, not three.
    const imbalance = Math.max(0, Math.abs(r - i) - flex);
    const imbalanceTerm = imbalance * w.resourceInfluenceImbalance;
    const planetCountTerm = planets < 3 ? w.lowPlanetCount : planets > 5 ? w.highPlanetCount : 0;

    return {
        tiles: scored,
        r, i, flex, planets,
        // What Milty's slice limits call "optimal" resources and influence: flex split half
        // to each side, as the generator has always counted it for those limits.
        optimalResources: r + flex / 2,
        optimalInfluence: i + flex / 2,
        tileTotal,
        imbalance,
        imbalanceTerm,
        planetCountTerm,
        score: tileTotal + imbalanceTerm + planetCountTerm,
    };
}
