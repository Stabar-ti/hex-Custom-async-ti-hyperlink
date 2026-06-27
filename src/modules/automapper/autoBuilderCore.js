/**
 * AutoMapper Core — fills unfilled hexes with real TI4 systems.
 * "Unfilled" = hex has baseType set (via Draw Helpers) but no realId.
 */

import { passesAutoMapperFilters } from '../../ui/uiFilters.js';
import { calculateSystemValue, getFactors, getTypeGroup } from '../../features/valueOverlay.js';

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
    'special':          ['special', 'empty'],  // no anomaly systems? fall back to empty
    'empty':            ['empty'],
    'homesystem':       ['homesystem'],
    'fracture':         ['fracture'],  // fracture positions only accept fracture tiles — no downgrade
};

// ---- Data helpers ----

export function getUnfilledHexes(editor, { includeHomeSystems = false } = {}) {
    return Object.entries(editor.hexes)
        .filter(([, h]) => {
            if (!h.baseType || h.baseType === '') return false;
            if (h.baseType === 'hyperlane') return false;
            // Void means "intentionally blank" — never a candidate for filling, so it
            // must never show up as a downgrade/failure in the AutoMapper preview.
            if (h.baseType === 'void') return false;
            if (!includeHomeSystems && h.baseType === 'homesystem') return false;
            return !h.realId;
        })
        .map(([label, hex]) => ({ label, hex }));
}

// Tile IDs excluded from automap (mirrors milty EXCLUDED_TILE_IDS)
const EXCLUDED_IDS = new Set([
    '83a','83a60','83a120','83a180','83a240','83a300',
    '83b','83b60','83b120','83b180','83b240','83b300',
    '84a','84a60','84a120','84a180','84a240','84a300',
    '84b','84b60','84b120','84b180','84b240','84b300',
    '85a','85a60','85a120','85a180','85a240','85a300',
    '85b','82','82b','82a','18','82ah','82h','c41','81','rexmex',
    'd35a','d35b','d36','m28','s11','s12','s13','silver_flame','94',
]);

export function getAvailableSystems(editor, {
    includeWormholes = false,
    allowDuplicatesNoPlanet = false,
    sources = null,   // null = use DOM filters; object = explicit source flags
} = {}) {
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
        if (!id) return false;
        if (seen.has(id)) return false;

        const noPlanet = !sys.planets?.length;
        // Allow duplicate no-planet systems if requested (req 7)
        if (!allowDuplicatesNoPlanet && usedIds.has(id)) return false;
        if (allowDuplicatesNoPlanet && !noPlanet && usedIds.has(id)) return false;

        seen.add(id);
        if (sys.isHyperlane) return false;
        if (EXCLUDED_IDS.has(id.toLowerCase())) return false;          // milty excluded IDs (req 4)
        if (!includeWormholes && sys.wormholes?.length) return false;

        // Source filter: use explicit opts.sources if provided, else fall back to DOM (req 3)
        if (sources) {
            const src = (sys.source || '').toLowerCase();
            const ok = (sources.base && src === 'base') ||
                       (sources.pok  && (src === 'pok' || src === 'codex')) ||
                       (sources.te   && (src === 'thunders_edge' || src === 'thundersedge')) ||
                       (sources.ds   && (src === 'ds' || src === 'uncharted_space')) ||
                       (sources.eronous && src === 'eronous') ||
                       (sources.others && !['base','pok','codex','ds','uncharted_space','thunders_edge','thundersedge','eronous'].includes(src) && src !== '');
            if (!ok) return false;
        } else {
            if (!passesAutoMapperFilters(sys)) return false;
        }

        if (sys.name?.toLowerCase().includes('mecatol') ||
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
 * Pick the best-matching system from a bucket given a {tier, r, i, t} preference.
 *
 * Priority:
 *  1. Exact tier match, then ranked by R/I/T skew score
 *  2. Adjacent tier (±1), ranked by skew score
 *  3. Any system — pick highest skew score
 */
function pickFromBucket(bucket, vt, valueTierMap) {
    if (!vt || !valueTierMap) return bucket.pop();

    const tier    = vt.tier || null;
    const hasSkew = vt.r || vt.i || vt.t;

    // Score a system by how well it matches the R/I/T skew preference
    function skewScore(sys) {
        if (!hasSkew) return 0;
        const planets = Array.isArray(sys.planets) ? sys.planets : [];
        let idealR = 0, idealI = 0, techCount = 0;
        for (const p of planets) {
            const r = p.resources || 0, i = p.influence || 0;
            if (r > i) idealR += r; else if (i > r) idealI += i; else { idealR += r/2; idealI += i/2; }
            if (p.techSpecialty) techCount++;
            if (Array.isArray(p.techSpecialties)) techCount += p.techSpecialties.length;
        }
        return (vt.r ? idealR * 1.5 : 0) + (vt.i ? idealI * 1.5 : 0) + (vt.t ? techCount * 3 : 0);
    }

    // Partition bucket by tier match
    const getTier = s => valueTierMap.get(s.id?.toString().toUpperCase());
    const exact   = tier ? bucket.filter(s => getTier(s) === tier)               : bucket;
    const adj     = tier ? bucket.filter(s => { const t = getTier(s); return t !== undefined && t !== tier && Math.abs(t - tier) <= 1; }) : [];

    const pool = exact.length ? exact : adj.length ? adj : bucket;
    if (!pool.length) return bucket.pop();

    // Pick best skew score within the chosen tier band
    let best = pool[0], bestScore = skewScore(pool[0]);
    for (let i = 1; i < pool.length; i++) {
        const s = skewScore(pool[i]);
        if (s > bestScore) { bestScore = s; best = pool[i]; }
    }

    const idx = bucket.indexOf(best);
    if (idx >= 0) bucket.splice(idx, 1);
    return best;
}

/**
 * One assignment attempt. Returns:
 *   assignments:      [{label, sys}]
 *   tokenPlacements:  [{label, effects: []}]  — apply effects via applyEffect after assignSystem
 *   downgrades:       [{label, from, to}]
 *   unmatched:        [label]
 */
function tryAssign(unfilled, pools, valueTierMap = null) {
    const p = copyShuffled(pools);

    const assignments = [];
    const tokenPlacements = [];
    const downgrades = [];
    const unmatched = [];

    // Any available system across all pools — used as last-resort token fallback.
    // Exclude homesystem/fracture pools: those tile types are restricted to their
    // matching hex baseType and must never leak onto a regular hex as a fallback.
    const anyPool = Object.entries(p)
        .filter(([key]) => !key.startsWith('homesystem') && !key.startsWith('fracture'))
        .flatMap(([, arr]) => arr);

    for (const { label, hex } of unfilled) {
        const reqEffects = hex.effects?.size ? Array.from(hex.effects) : [];
        const vt = (hex.valueTarget && typeof hex.valueTarget === 'object') ? hex.valueTarget : null;

        // If baseType is 'special' but no effects are painted, treat as 'empty':
        // the user just wants a non-planet tile, not a specific anomaly system.
        const reqType = (hex.baseType === 'special' && reqEffects.length === 0) ? 'empty' : hex.baseType;

        // 1. Try exact-effect-matched system first.
        let assigned = null;
        if (reqEffects.length > 0) {
            const effectKey = [...reqEffects].sort().join(',');
            const key = `${reqType}|${effectKey}`;
            if (p[key]?.length) {
                const sys = pickFromBucket(p[key], vt, valueTierMap);
                assigned = { sys, usedEffect: effectKey };
            }
        }

        // 2. Fall back to clean system of the same/downgraded type.
        if (!assigned) {
            const chain = DOWNGRADE_CHAIN[reqType] || [reqType];
            for (const tryType of chain) {
                if (p[tryType]?.length) {
                    const sys = pickFromBucket(p[tryType], vt, valueTierMap);
                    assigned = { sys, usedEffect: null };
                    if (tryType !== hex.baseType) downgrades.push({
                        label, from: hex.baseType, to: tryType,
                        reason: `No '${hex.baseType}' systems left in the pool — used a '${tryType}' system instead.`,
                    });
                    break;
                }
            }
        }

        // 3. Token-only fallback: if no system of any suitable type is available,
        //    use any remaining system and cover the missing effects with tokens.
        //    This ensures effects are always represented even when pool is exhausted.
        //    Prefer a system whose own inherent effects don't exceed what was
        //    requested — otherwise the hex could end up showing anomalies the
        //    map designer never asked for (e.g. a leftover supernova system
        //    used to fill a plain "empty" hex).
        if (!assigned && anyPool.length > 0) {
            const reqEffectSet = new Set(reqEffects);
            let idx = anyPool.findIndex(s => {
                const se = getSystemEffects(s);
                for (const e of se) if (!reqEffectSet.has(e)) return false;
                return true;
            });
            if (idx === -1) idx = anyPool.length - 1; // nothing clean left — last resort
            const sys = anyPool.splice(idx, 1)[0];
            assigned = { sys, usedEffect: null };
            downgrades.push({
                label, from: hex.baseType, to: 'token-fallback',
                reason: `No '${hex.baseType}' (or downgraded) systems left in the pool — used a leftover '${classifySystem(sys)}' system as a last resort.`,
            });
        }

        if (!assigned) { unmatched.push(label); continue; }

        assignments.push({ label, sys: assigned.sys });

        // If effects were requested but the assigned system doesn't provide them,
        // place anomaly tokens to represent them visually.
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
    allowDuplicatesNoPlanet = false,
    sources = null,
    weights = SCORING_WEIGHTS,
    settings = null,
    valueROn = false,
    valueIOn = false,
    valueTOn = false,
} = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    if (!unfilled.length) return { assignments: [], tokenPlacements: [], downgrades: [], unmatched: [], score: null, info: 'No unfilled hexes found.' };

    const available = getAvailableSystems(editor, { includeWormholes, allowDuplicatesNoPlanet, sources });
    if (!available.length) return { assignments: [], tokenPlacements: [], downgrades: [], unmatched: unfilled.map(h => h.label), score: null, info: 'No available systems found.' };

    const pools = buildPools(available);

    // Build value tier map from the available pool if any hex has a valueTarget painted
    const anyTarget = unfilled.some(({ hex }) => hex.valueTarget);
    let valueTierMap = null;
    if (anyTarget) {
        const factors = getFactors(valueROn, valueIOn, valueTOn);
        // Group available systems by planet-count type so tier 5 = "best 2-planet",
        // not "best overall" — mirrors the display overlay grouping.
        const groups = {};
        available.filter(s => s.id).forEach(s => {
            const g = getTypeGroup(s);
            if (!groups[g]) groups[g] = [];
            groups[g].push({ id: s.id.toString().toUpperCase(), value: calculateSystemValue(s, factors) });
        });
        valueTierMap = new Map();
        for (const entries of Object.values(groups)) {
            entries.sort((a, b) => a.value - b.value);
            const n = entries.length;
            entries.forEach(({ id }, idx) => {
                const pct = idx / n;
                const tier = pct < 0.2 ? 1 : pct < 0.4 ? 2 : pct < 0.6 ? 3 : pct < 0.8 ? 4 : 5;
                valueTierMap.set(id, tier);
            });
        }
    }

    if (!balanced) {
        return { ...tryAssign(unfilled, pools, valueTierMap), score: null };
    }

    let best = null, bestScore = Infinity;
    for (let i = 0; i < iterations; i++) {
        const result = tryAssign(unfilled, pools, valueTierMap);
        const score = scoreAssignments(result.assignments, editor, { balanceRange, weights, settings });
        if (score < bestScore) { bestScore = score; best = result; }
    }
    return { ...best, score: bestScore };
}

/**
 * Analysis snapshot for the UI — what types are needed and available.
 */
export function analyzeMap(editor, { includeHomeSystems = false, includeWormholes = false, allowDuplicatesNoPlanet = false, sources = null } = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    const available = getAvailableSystems(editor, { includeWormholes, allowDuplicatesNoPlanet, sources });
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
