/**
 * AutoMapper Core — fills unfilled hexes with real TI4 systems.
 * "Unfilled" = hex has baseType set (via Draw Helpers) but no realId.
 */

import { passesAutoMapperFilters } from '../../ui/uiFilters.js';

// ---- Scoring weights (mirrors miltyBuilderRandomTool DEFAULT_WEIGHTS) ----
// Open Milty Slice Designer → Weighting Settings to tune these values.
export const SCORING_WEIGHTS = {
    supernova: -3, asteroidField: -1, nebula: 0, gravityRift: -2, entropicScar: 1,
    resourceValue: 1, influenceValue: 1,
    techSpecialty: 2, legendaryPlanet: 5, wormhole: 1,
    industrial: 0.5, cultural: 0.5, hazardous: 0.5,
    resourceInfluenceImbalance: -0.5, lowPlanetCount: -3, highPlanetCount: -1
};

// ---- System classification (mirrors assignSystem.js) ----
function classifySystem(sys) {
    // Fracture is checked first — fracture tiles are a distinct category regardless of planet content
    if (sys.tileBack === 'fracture') return 'fracture';
    const planets = Array.isArray(sys.planets) ? sys.planets : [];
    if (planets.some(p => p.legendaryAbilityName && p.legendaryAbilityText)) return 'legendary planet';
    if (planets.some(p => p.planetType === 'FACTION')) return 'homesystem';
    if (planets.length >= 3) return '3 planet';
    if (planets.length >= 2) return '2 planet';
    if (planets.length === 1) return '1 planet';
    if (sys.isAsteroidField || sys.isSupernova || sys.isNebula || sys.isGravityRift || sys.isScar) return 'special';
    return 'empty';
}

// Returns a Set of effect strings present on a system
function getSystemEffects(sys) {
    const e = new Set();
    if (sys.isNebula)        e.add('nebula');
    if (sys.isGravityRift)   e.add('rift');
    if (sys.isSupernova)     e.add('supernova');
    if (sys.isAsteroidField) e.add('asteroid');
    if (sys.isScar)          e.add('scar');
    return e;
}

// ---- Utilities ----
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function axialDist(a, b) {
    const dq = a.q - b.q, dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ---- Downgrade chain: if no systems of required type, try these in order ----
const DOWNGRADE_CHAIN = {
    '3 planet':         ['3 planet', '2 planet', '1 planet'],
    '2 planet':         ['2 planet', '1 planet'],
    '1 planet':         ['1 planet'],
    'legendary planet': ['legendary planet', '2 planet', '1 planet'],
    'special':          ['special'],
    'empty':            ['empty'],
    'homesystem':       ['homesystem'],
    'fracture':         ['fracture'],  // fracture positions only accept fracture tiles — no downgrade
};

// ---- Data helpers ----

export function getUnfilledHexes(editor, { includeHomeSystems = false } = {}) {
    return Object.entries(editor.hexes)
        .filter(([, h]) => {
            if (!h.baseType || h.baseType === '') return false;
            if (!includeHomeSystems && h.baseType === 'homesystem') return false;
            return !h.realId;
        })
        .map(([label, hex]) => ({ label, hex }));
}

export function getAvailableSystems(editor, { includeWormholes = false } = {}) {
    const allSystems = editor.allSystems;
    if (!allSystems?.length) return [];

    const usedIds = new Set(
        Object.values(editor.hexes)
            .filter(h => h.realId)
            .map(h => h.realId.toString().toUpperCase())
    );

    const seen = new Set();
    return allSystems.filter(sys => {
        const id = sys.id?.toString().toUpperCase();
        if (!id || seen.has(id) || usedIds.has(id)) return false;
        seen.add(id);
        if (sys.isHyperlane) return false;                            // never use hyperlanes
        if (!includeWormholes && sys.wormholes?.length) return false; // skip wormholes unless toggled
        if (!passesAutoMapperFilters(sys)) return false;              // source + attribute filters from search panel
        // Mecatol Rex is always pre-placed at center — never auto-assign it
        if (sys.id?.toString() === '18' ||
            sys.name?.toLowerCase().includes('mecatol') ||
            sys.planets?.some(p => p.name?.toLowerCase().includes('mecatol'))) return false;
        return true;
    });
}

// ---- Pool building ----

/**
 * Builds typed pools.
 * Pool keys:
 *   'TYPE'                  — systems with NO effects (clean)
 *   'TYPE|eff1,eff2,...'    — systems whose effects EXACTLY match the sorted set
 *
 * Using sorted combined-effect keys ensures a rift+asteroid system can never land
 * on a rift-only hex (fix 3): keys only match when the effect sets are identical.
 */
function buildPools(systems) {
    const pools = {};
    function push(key, sys) {
        if (!pools[key]) pools[key] = [];
        pools[key].push(sys);
    }
    for (const sys of systems) {
        const type = classifySystem(sys);
        if (type === 'homesystem') continue;
        const effects = getSystemEffects(sys);
        if (effects.size === 0) {
            push(type, sys);
        } else {
            const effectKey = [...effects].sort().join(',');
            push(`${type}|${effectKey}`, sys);
        }
    }
    return pools;
}

// Make a shuffled deep-copy of pools for one assignment attempt
function copyShuffled(pools) {
    const copy = {};
    for (const [k, arr] of Object.entries(pools)) copy[k] = shuffle([...arr]);
    return copy;
}

// ---- Assignment engine ----

/**
 * One assignment attempt. Returns:
 *   assignments:      [{label, sys}]
 *   tokenPlacements:  [{label, effects: []}]  — apply effects via applyEffect after assignSystem
 *   downgrades:       [{label, from, to}]
 *   unmatched:        [label]
 */
function tryAssign(unfilled, pools) {
    const p = copyShuffled(pools);

    const assignments = [];
    const tokenPlacements = [];
    const downgrades = [];
    const unmatched = [];

    for (const { label, hex } of unfilled) {
        const reqType = hex.baseType;
        const reqEffects = hex.effects?.size ? Array.from(hex.effects) : [];

        // 1. Try exact-effect-matched system first.
        // Key is sorted so a hex requiring {rift} only matches systems with EXACTLY {rift},
        // never a combined rift+asteroid system (fix 3).
        let assigned = null;
        if (reqEffects.length > 0) {
            const effectKey = [...reqEffects].sort().join(',');
            const key = `${reqType}|${effectKey}`;
            if (p[key]?.length) assigned = { sys: p[key].pop(), usedEffect: effectKey };
        }

        // 2. Fall back to clean system + note token placement (req 4)
        if (!assigned) {
            const chain = DOWNGRADE_CHAIN[reqType] || [reqType];
            for (const tryType of chain) {
                if (p[tryType]?.length) {
                    assigned = { sys: p[tryType].pop(), usedEffect: null };
                    if (tryType !== reqType) downgrades.push({ label, from: reqType, to: tryType });
                    break;
                }
            }
        }

        if (!assigned) { unmatched.push(label); continue; }

        assignments.push({ label, sys: assigned.sys });

        // If effects were requested but we used a clean system, place effect tokens (req 4)
        if (reqEffects.length > 0 && !assigned.usedEffect) {
            tokenPlacements.push({ label, effects: reqEffects });
        }
    }

    return { assignments, tokenPlacements, downgrades, unmatched };
}

// ---- Scoring (same logic as miltyBuilderRandomTool calculateSliceScore) ----

function scoreSlice(systems, weights) {
    let res = 0, inf = 0, legends = 0;
    const techs = [], wormholes = [], anomalies = [];
    let industrialCount = 0, culturalCount = 0, hazardousCount = 0;

    for (const sys of systems) {
        for (const p of (sys.planets || [])) {
            res += p.resources || 0;
            inf += p.influence || 0;
            if (p.legendaryAbilityName) legends++;
            if (p.techSpecialty) techs.push(p.techSpecialty);
            if (p.planetType === 'INDUSTRIAL') industrialCount++;
            else if (p.planetType === 'CULTURAL') culturalCount++;
            else if (p.planetType === 'HAZARDOUS') hazardousCount++;
        }
        if (sys.wormholes?.length) wormholes.push(...sys.wormholes);
        if (sys.isSupernova)     anomalies.push('supernova');
        if (sys.isAsteroidField) anomalies.push('asteroidField');
        if (sys.isNebula)        anomalies.push('nebula');
        if (sys.isGravityRift)   anomalies.push('gravityRift');
        if (sys.isScar)          anomalies.push('entropicScar');
    }

    const planetCount = systems.reduce((s, sys) => s + (sys.planets?.length || 0), 0);
    const imbalance = Math.abs(res - inf);
    const w = weights;

    let score = 0;
    score += res * w.resourceValue;
    score += inf * w.influenceValue;
    score += imbalance * w.resourceInfluenceImbalance;
    score += legends * w.legendaryPlanet;
    score += techs.length * w.techSpecialty;
    score += wormholes.length * w.wormhole;
    score += industrialCount * w.industrial;
    score += culturalCount  * w.cultural;
    score += hazardousCount * w.hazardous;
    for (const a of anomalies) score += (w[a] || 0);
    if (planetCount < 3) score += w.lowPlanetCount;
    if (planetCount > 5) score += w.highPlanetCount;

    return score;
}

/**
 * Score by std-dev of slice scores across home systems.
 * Also penalises slices that fall below milty's min R/I thresholds (from settings).
 * Only considers assigned hexes within balanceRange of each home. (req 9)
 */
function scoreAssignments(assignments, editor, { balanceRange = 2, weights = SCORING_WEIGHTS, settings = null } = {}) {
    const homes = Object.values(editor.hexes).filter(h => h.baseType === 'homesystem');
    if (homes.length < 2) return 0;

    // Bucket systems by nearest home within balanceRange
    const sliceData = new Map(homes.map(h => [h, { systems: [], res: 0, inf: 0 }]));

    for (const { label, sys } of assignments) {
        const hex = editor.hexes[label];
        if (!hex) continue;
        let nearest = homes[0], nearestDist = axialDist(hex, homes[0]);
        for (const h of homes) {
            const d = axialDist(hex, h);
            if (d < nearestDist) { nearest = h; nearestDist = d; }
        }
        if (nearestDist <= balanceRange) {
            const s = sliceData.get(nearest);
            s.systems.push(sys);
            for (const p of (sys.planets || [])) {
                s.res += p.resources || 0;
                s.inf += p.influence || 0;
            }
        }
    }

    // Min R/I thresholds from milty settings (req 8)
    const minRes   = settings?.sliceGeneration?.minOptimalResources ?? 0;
    const minInf   = settings?.sliceGeneration?.minOptimalInfluence ?? 0;
    const minTotal = settings?.sliceGeneration?.minOptimalTotal     ?? 0;
    const maxTotal = settings?.sliceGeneration?.maxOptimalTotal     ?? Infinity;

    const scores = [];
    for (const { systems, res, inf } of sliceData.values()) {
        let score = scoreSlice(systems, weights);
        // Penalty for falling below milty minimums (large weight so optimizer avoids them)
        if (res   < minRes)   score -= (minRes   - res)   * 10;
        if (inf   < minInf)   score -= (minInf   - inf)   * 10;
        if (res + inf < minTotal) score -= (minTotal - (res + inf)) * 5;
        if (res + inf > maxTotal) score -= ((res + inf) - maxTotal) * 3;
        scores.push(score);
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance); // lower = better
}

// ---- Public API ----

/**
 * @param {Object} editor
 * @param {Object} opts
 * @param {boolean} opts.balanced           Run multiple shuffles, keep best resource spread
 * @param {number}  opts.iterations         How many attempts in balanced mode (req 10)
 * @param {number}  opts.balanceRange       Axial distance from home systems to consider (req 9)
 * @param {boolean} opts.includeHomeSystems Include HS tiles in fill (req 1)
 * @param {boolean} opts.includeWormholes   Include wormhole systems in pool (req 3)
 * @param {Object}  opts.weights            Score weights (from milty if available) (req 8)
 * @returns {{ assignments, tokenPlacements, downgrades, unmatched, score }}
 */
export function fillRemaining(editor, {
    balanced = false,
    iterations = 8,
    balanceRange = 2,
    includeHomeSystems = false,
    includeWormholes = false,
    weights = SCORING_WEIGHTS,
    settings = null,   // milty getCurrentSettings() for R/I min/max constraints
} = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    if (!unfilled.length) return { assignments: [], tokenPlacements: [], downgrades: [], unmatched: [], score: null, info: 'No unfilled hexes found.' };

    const available = getAvailableSystems(editor, { includeWormholes });
    if (!available.length) return { assignments: [], tokenPlacements: [], downgrades: [], unmatched: unfilled.map(h => h.label), score: null, info: 'No available systems found.' };

    const pools = buildPools(available);

    if (!balanced) {
        return { ...tryAssign(unfilled, pools), score: null };
    }

    let best = null, bestScore = Infinity;
    for (let i = 0; i < iterations; i++) {
        const result = tryAssign(unfilled, pools);
        const score = scoreAssignments(result.assignments, editor, { balanceRange, weights, settings });
        if (score < bestScore) { bestScore = score; best = result; }
    }
    return { ...best, score: bestScore };
}

/**
 * Analysis snapshot for the UI — what types are needed and available.
 */
export function analyzeMap(editor, { includeHomeSystems = false, includeWormholes = false } = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    const available = getAvailableSystems(editor, { includeWormholes });
    const pools = buildPools(available);

    const neededByType = {};
    const effectsNeeded = {}; // which hexes need specific effects
    for (const { hex } of unfilled) {
        neededByType[hex.baseType] = (neededByType[hex.baseType] || 0) + 1;
        if (hex.effects?.size) {
            for (const eff of hex.effects) {
                const key = `${hex.baseType}|${eff}`;
                effectsNeeded[key] = (effectsNeeded[key] || 0) + 1;
            }
        }
    }

    const typeStatus = {};
    for (const type of Object.keys(neededByType)) {
        const need = neededByType[type];
        // "have" = clean pool + all effect pools of that type
        const have = Object.entries(pools)
            .filter(([k]) => k === type || k.startsWith(type + '|'))
            .reduce((s, [, arr]) => s + arr.length, 0);
        typeStatus[type] = { need, have, ok: have >= need };
    }

    return {
        totalUnfilled: unfilled.length,
        totalAvailable: available.length,
        typeStatus,
        effectsNeeded,
        canFill: unfilled.length > 0,
        hasHomeSystems: Object.values(editor.hexes).some(h => h.baseType === 'homesystem'),
        systemsLoaded: !!(editor.allSystems?.length),
    };
}
