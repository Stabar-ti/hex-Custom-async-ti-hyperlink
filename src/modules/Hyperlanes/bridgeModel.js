// @ts-check
/**
 * Hyperlane bridges: a lane matrix on a SYSTEM tile whose lanes run straight through the
 * system along its rim (LRR 44.1). Port of the bot's `BridgeMatrix` / `HyperlaneBridges`
 * (ti4.service.map, AsyncTI4 #6147). Pure, no DOM — tested by tools/test-bridges-portals.js.
 *
 * A bridge is kept as `hex.bridge`: the bot's *stored* 0/1 6×6 matrix (row = side a lane
 * comes in by, column = side it leaves by; a cell set one way only is one-way), always
 * with a zero diagonal. The JSON `bridgeLanes` string is the *typed* form, exactly like
 * `customHyperlaneString` — see data/hyperlaneIO.js.
 *
 * Sides 0-5 are N, NE, SE, S, SW, NW (utils/hexGrid.js). Rim "gap" g is the stretch of rim
 * from side g clockwise to side g+1.
 */

import { cloneMatrix, emptyMatrix, rotated } from './hyperlaneModel.js';

export const SIDE_NAMES = Object.freeze(['N', 'NE', 'SE', 'S', 'SW', 'NW']);

/**
 * The lanes a matrix leads, as a clean boolean grid (diagonal ignored, as BridgeMatrix.parse).
 * @param {number[][]|null|undefined} m
 * @returns {boolean[][]}
 */
function leadsOf(m) {
    const out = [];
    for (let a = 0; a < 6; a++) {
        const row = [];
        for (let b = 0; b < 6; b++) row.push(a !== b && Number(m?.[a]?.[b]) === 1);
        out.push(row);
    }
    return out;
}

/** Whether a bridge matrix carries no lane at all. */
export function isEmptyBridge(m) {
    return bridgeSides(m).length === 0;
}

/** Sides a lane enters or leaves by, ascending. */
export function bridgeSides(m) {
    const leads = leadsOf(m);
    const sides = [];
    for (let s = 0; s < 6; s++) {
        if (leads[s].some(Boolean) || leads.some(row => row[s])) sides.push(s);
    }
    return sides;
}

/** Whether a lane enters the system by `side` (ships may come in there). */
export function entersAt(m, side) {
    return leadsOf(m)[side].some(Boolean);
}

/** Whether a lane leaves the system by `side`. */
export function exitsAt(m, side) {
    return leadsOf(m).some(row => row[side]);
}

/**
 * Sides a ship entering by `entered` may leave by. `bothWays` also follows lanes backwards
 * (adjacency rather than movement), as BridgeMatrix.exitsFrom.
 */
export function bridgeExitsFrom(m, entered, bothWays = false) {
    const leads = leadsOf(m);
    const exits = [];
    for (let to = 0; to < 6; to++) {
        if (leads[entered]?.[to] || (bothWays && leads[to]?.[entered])) exits.push(to);
    }
    return exits;
}

/** Sides from which a lane leads to `exit` (BridgeMatrix.entriesLeadingTo). */
export function bridgeEntriesLeadingTo(m, exit, bothWays = false) {
    const leads = leadsOf(m);
    const entries = [];
    for (let from = 0; from < 6; from++) {
        if (leads[from]?.[exit] || (bothWays && leads[exit]?.[from])) entries.push(from);
    }
    return entries;
}

/**
 * Unordered lane pairs {low, high}, ordered by low then high (BridgeMatrix.pairs).
 * @returns {Array<{low: number, high: number}>}
 */
export function bridgePairs(m) {
    const leads = leadsOf(m);
    const pairs = [];
    for (let a = 0; a < 6; a++) {
        for (let b = a + 1; b < 6; b++) if (leads[a][b] || leads[b][a]) pairs.push({ low: a, high: b });
    }
    return pairs;
}

/**
 * Rim gaps a lane covers going clockwise from its low side (or from its high side).
 * @param {{low: number, high: number}} pair
 * @param {boolean} clockwiseFromLow
 * @returns {number[]}
 */
export function rimGaps(pair, clockwiseFromLow) {
    const from = clockwiseFromLow ? pair.low : pair.high;
    const to = clockwiseFromLow ? pair.high : pair.low;
    const gaps = [];
    for (let gap = from; gap !== to; gap = (gap + 1) % 6) gaps.push(gap);
    return gaps;
}

/** Whether two lanes would cross on the rim (their ends interleave). */
export function pairsCross(p, o) {
    return (p.low < o.low && o.low < p.high && p.high < o.high)
        || (o.low < p.low && p.low < o.high && o.high < p.high);
}

/**
 * Every way round the rim that gives each lane its own stretch, as BridgeMatrix
 * rimLayoutsWithoutSharing: one boolean per pair (true = clockwise from low), in mask order.
 * @returns {boolean[][]}
 */
export function rimLayoutsWithoutSharing(m) {
    const pairs = bridgePairs(m);
    const layouts = [];
    for (let mask = 0; mask < (1 << pairs.length); mask++) {
        const layout = [];
        const used = new Set();
        let shares = false;
        for (let i = 0; i < pairs.length && !shares; i++) {
            const cw = (mask & (1 << i)) !== 0;
            layout.push(cw);
            for (const gap of rimGaps(pairs[i], cw)) {
                if (used.has(gap)) shares = true;
                used.add(gap);
            }
        }
        if (!shares) layouts.push(layout);
    }
    return layouts;
}

/** A lane described as the bot does: `N ↔ S`, `N → S`. */
export function describePair(m, pair) {
    const leads = leadsOf(m);
    const low = SIDE_NAMES[pair.low], high = SIDE_NAMES[pair.high];
    if (leads[pair.low][pair.high] && leads[pair.high][pair.low]) return `${low} ↔ ${high}`;
    return leads[pair.low][pair.high] ? `${low} → ${high}` : `${high} → ${low}`;
}

/** Every lane of a bridge, described, e.g. `['N → S', 'NE ↔ SE']`. */
export function describeBridge(m) {
    return bridgePairs(m).map(p => describePair(m, p));
}

/**
 * Why a set of lanes can't be laid on the rim, or null (BridgeMatrix.layoutProblem, with the
 * bot's wording).
 */
export function layoutProblem(m) {
    const pairs = bridgePairs(m);
    for (let side = 0; side < 6; side++) {
        const using = pairs.filter(p => p.low === side || p.high === side).map(p => describePair(m, p));
        if (using.length > 1) {
            return `${SIDE_NAMES[side]} is used by ${using.join(' and ')}. A side can carry one bridge lane (no splits or merges).`;
        }
    }
    for (const p of pairs) {
        for (const o of pairs) {
            if (pairsCross(p, o)) return `${describePair(m, p)} and ${describePair(m, o)} would cross on the rim.`;
        }
    }
    if (pairs.length && rimLayoutsWithoutSharing(m).length === 0) {
        return `${pairs.map(p => describePair(m, p)).join(', ')} can't each get their own stretch of the rim.`;
    }
    return null;
}

/**
 * Why a stored matrix can't be a bridge, or null (HyperlaneBridges.problemWith minus the
 * tile checks, which belong to the caller).
 */
export function bridgeProblem(m) {
    if (!Array.isArray(m) || m.length !== 6 || m.some(r => !Array.isArray(r) || r.length !== 6)) {
        return 'The matrix needs 6 rows of 6 values.';
    }
    for (let s = 0; s < 6; s++) {
        if (Number(m[s][s]) !== 0) return "A bridge can't connect a side to itself (no roundabouts); keep the diagonal at 0.";
    }
    return layoutProblem(m);
}

/**
 * The rim layout the editor draws: of the valid layouts, the one with the shortest total
 * arc, the first in mask order on a tie. (The bot also weighs how much of a lane hides
 * behind planets; that is only cosmetic.) Falls back to each lane's shorter arc when no
 * valid layout exists, so an invalid bridge still draws.
 *
 * @returns {Array<{low: number, high: number, clockwiseFromLow: boolean, gaps: number[]}>}
 */
export function chosenLayout(m) {
    const pairs = bridgePairs(m);
    const layouts = rimLayoutsWithoutSharing(m);
    let best = null, bestCost = Infinity;
    for (const layout of layouts) {
        const cost = layout.reduce((sum, cw, i) => sum + rimGaps(pairs[i], cw).length, 0);
        if (cost < bestCost) { best = layout; bestCost = cost; }
    }
    if (!best) best = pairs.map(p => rimGaps(p, true).length <= rimGaps(p, false).length);
    return pairs.map((p, i) => ({ ...p, clockwiseFromLow: best[i], gaps: rimGaps(p, best[i]) }));
}

/** A copy of the bridge turned `steps` sixths clockwise (copy/paste rotation). */
export function rotatedBridge(m, steps) {
    return rotated(m, steps);
}

/** A clean stored bridge (0/1, zero diagonal) from any matrix-ish value, or null if empty. */
export function normalizedBridge(m) {
    if (!Array.isArray(m)) return null;
    const leads = leadsOf(m);
    const out = emptyMatrix();
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) out[a][b] = leads[a][b] ? 1 : 0;
    return isEmptyBridge(out) ? null : out;
}

/** Whether a hex carries a (non-empty) bridge. */
export function hasBridge(hex) {
    return Array.isArray(hex?.bridge) && !isEmptyBridge(hex.bridge);
}

/**
 * A bridge matrix from editor lane rows, e.g. `[{a: 0, b: 3, dir: 'ab'}]`.
 * `dir`: 'both' two-way, 'ab' one-way a → b, 'ba' one-way b → a.
 */
export function bridgeFromLanes(lanes) {
    const out = emptyMatrix();
    for (const { a, b, dir } of lanes || []) {
        if (!(a >= 0 && a < 6 && b >= 0 && b < 6) || a === b) continue;
        if (dir !== 'ba') out[a][b] = 1;
        if (dir !== 'ab') out[b][a] = 1;
    }
    return out;
}

/** The lane rows of a bridge matrix (inverse of bridgeFromLanes; a = low side). */
export function lanesOfBridge(m) {
    const leads = leadsOf(m);
    return bridgePairs(m).map(({ low, high }) => ({
        a: low, b: high,
        dir: leads[low][high] && leads[high][low] ? 'both' : leads[low][high] ? 'ab' : 'ba'
    }));
}

/** A deep copy of a bridge, or null. */
export function cloneBridge(m) {
    return Array.isArray(m) ? cloneMatrix(m) : null;
}
