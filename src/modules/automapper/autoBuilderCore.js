/**
 * AutoMapper Core — fills unfilled hexes with real TI4 systems.
 * "Unfilled" = hex has baseType set (via Draw Helpers) but no realId.
 */

import { passesAutoMapperFilters } from '../../ui/uiFilters.js';
import { calculateSystemValue, getFactors, getTypeGroup } from '../../features/valueOverlay.js';
import { hasFactionHomeworld, isFractureTile } from '../SystemPicker/pickerModel.js';
import {
    solveAssignment, DOWNGRADE_CHAIN, RESTRICTED_TYPES, TIER_POLICIES, TYPE_RANK,
} from './assignSolver.js';

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
export function classifySystem(sys) {
    // Fracture is checked first — fracture tiles are a distinct category regardless of planet content
    if (isFractureTile(sys)) return 'fracture';
    const planets = Array.isArray(sys.planets) ? sys.planets : [];
    // Faction homeworlds are tested before legendary: five systems (92, br1, br5b, et11,
    // th13) are both, and for auto-placement "never drop a homeworld on a normal hex" wins.
    // hasFactionHomeworld is the picker's predicate — planetType === 'FACTION' misses seven
    // Thunder's Edge / Theodisi homeworlds whose planets carry a null planetType.
    if (hasFactionHomeworld(sys)) return 'homesystem';
    if (planets.some(p => p.legendaryAbilityName && p.legendaryAbilityText)) return 'legendary planet';
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

/**
 * Types whose systems never carry planets, so "Duplicate empty/anomaly" can satisfy any
 * amount of demand from a single tile. classifySystem only returns these for planet-free
 * systems, which is what makes the mapping safe.
 */
const NO_PLANET_TYPES = new Set(['empty', 'special']);

/**
 * The single interpretation of what a painted hex is asking for.
 *
 * Both the fill and the analysis call this, which is what keeps the Type breakdown
 * describing the pool the fill actually consumes.
 *
 * 'empty' and 'special' are the same request — a tile with no planets. The only thing
 * separating them is whether an anomaly is present, and painting an effect is how the user
 * says so. So the pair is normalised onto whichever one the pool actually uses:
 * classifySystem calls a planet-free anomaly tile 'special' and a plain one 'empty', and
 * nothing else can produce those keys.
 *
 *   special, no effects  -> empty     (a request for any non-planet tile)
 *   empty + asteroid     -> special   (a request for an asteroid field)
 *
 * The second direction is what makes 'empty + asteroid' behave like 'special + asteroid'.
 * Without it the fill looked for an 'empty|asteroid' bucket that can never exist, fell
 * through to the plain 'empty' chain, and dropped a token on a blank tile every time —
 * even with real asteroid tiles sitting unused in the pool.
 *
 * @returns {{ reqType: string, reqEffects: string[], effectKey: string|null, remapped: boolean }}
 */
export function resolveRequirement(hex) {
    const reqEffects = hex.effects?.size ? Array.from(hex.effects) : [];
    const painted = hex.baseType;

    let reqType = painted;
    if (painted === 'special' && reqEffects.length === 0) reqType = 'empty';
    else if (painted === 'empty' && reqEffects.length > 0) reqType = 'special';

    return {
        reqType,
        reqEffects,
        effectKey: reqEffects.length ? [...reqEffects].sort().join(',') : null,
        remapped: reqType !== painted,
    };
}

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
    includeHomeSystems = false,
    sources = null,   // null = picker filter only; object keyed by SOURCE_GROUPS key = narrow further
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

        // The picker's projected filter always runs — it is the only thing keeping FOW
        // placeholders, blank draft tiles and hyperlanes out of the pool. What the panel's
        // own Source checkboxes do is REPLACE the picker's source list (see
        // passesAutoMapperFilters): they are a source selector, so ANDing them with a
        // narrowed picker just empties the pool with no explanation. Grouping is delegated
        // to the picker so the two can't drift — the hand-rolled list this replaced tested
        // for a 'codex' source that the data spells 'codex3'.
        //
        // 'Include HS tiles' is the one case that needs homeworlds in the pool at all —
        // without it they are filtered out and a painted homesystem hex can never be
        // filled. RESTRICTED_TYPES keeps them off every other kind of hex.
        if (!passesAutoMapperFilters(sys, { allowFactionHomeworlds: includeHomeSystems, sources })) return false;

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

// ---- Assignment engine ----
//
// One optimal assignment for the whole map, not a greedy walk through it.
//
// Hexes asking for the same thing are interchangeable, and so are tiles sharing a type, an
// effect set and a value tier. That collapses the problem to a transportation problem
// between a few dozen demand groups and a few dozen supply cells, which assignSolver.js
// solves exactly. This file turns the map into that shape and turns the answer back into
// placements.
//
// What the solver does not decide is which individual tile comes out of a chosen cell —
// every tile in one is equivalent at the level the cost function can see. The R/I/T skew
// picks between them here, inside the cell.

/** How well a system matches an R/I/T skew preference. Higher is better; 0 if none asked. */
function skewScore(sys, vt) {
    if (!vt || !(vt.r || vt.i || vt.t)) return 0;
    const planets = Array.isArray(sys.planets) ? sys.planets : [];
    let idealR = 0, idealI = 0, techCount = 0;
    for (const p of planets) {
        const r = p.resources || 0, i = p.influence || 0;
        if (r > i) idealR += r; else if (i > r) idealI += i; else { idealR += r / 2; idealI += i / 2; }
        if (p.techSpecialty) techCount++;
        if (Array.isArray(p.techSpecialties)) techCount += p.techSpecialties.length;
    }
    return (vt.r ? idealR * 1.5 : 0) + (vt.i ? idealI * 1.5 : 0) + (vt.t ? techCount * 3 : 0);
}

/**
 * Split each pool bucket into (bucket, tier) cells — the unit the solver trades in.
 *
 * A tile with no tier lands in a tier-less cell, and pairCost charges nothing against those.
 * That is the honest answer rather than a default: calculateSystemValue returns 0 for every
 * planet-free tile, so their order inside the 'empty' group is sort order, not quality.
 */
function buildCells(pools, valueTierMap, { allowDuplicatesNoPlanet = false } = {}) {
    const cells = [];
    for (const [poolKey, systems] of Object.entries(pools)) {
        if (!systems.length) continue;
        const [type, effectPart] = poolKey.split('|');
        const effects = new Set(effectPart ? effectPart.split(',') : []);

        const byTier = new Map();
        for (const sys of systems) {
            const tier = valueTierMap ? (valueTierMap.get(String(sys.id).toUpperCase()) ?? null) : null;
            const k = tier ?? 0;
            if (!byTier.has(k)) byTier.set(k, []);
            byTier.get(k).push(sys);
        }

        for (const [tierKey, group] of byTier) {
            cells.push({
                key: poolKey + '#' + tierKey,
                poolKey,
                type,
                effects,
                tier: tierKey || null,
                count: group.length,
                systems: group,
                repeatable: allowDuplicatesNoPlanet && NO_PLANET_TYPES.has(type),
            });
        }
    }
    return cells;
}

/**
 * One assignment pass. Returns:
 *   assignments:      [{label, sys}]
 *   tokenPlacements:  [{label, effects: []}]  — apply via applyEffect after assignSystem
 *   downgrades:       [{label, from, to, reason}]
 *   unmatched:        [{label, reason}]
 *   resolutions:      [{label, reqKey, reqType, reqEffects, painted, outcome, wantTier, gotTier}]
 *
 * `resolutions` is what the Type breakdown is built from. Reporting the outcome of a real
 * assignment pass, rather than predicting one from pool sizes, is the only way the panel and
 * the fill cannot disagree — every previous version of that table was a second, drifting
 * implementation of these matching rules.
 *
 * outcome is one of:
 *   'exact'       — the tile the hex was painted for
 *   'token'       — right kind of tile, but the anomaly is drawn with a token
 *   'substituted' — a different tile type was used
 *   (hexes with no assignment are listed in `unmatched` instead)
 */
function tryAssign(unfilled, pools, valueTierMap = null, {
    allowDuplicatesNoPlanet = false,
    deterministic = false,
    costs = {},
} = {}) {
    // ── Demand: group the hexes asking for exactly the same thing ──
    const groups = new Map();
    for (const { label, hex } of unfilled) {
        const { reqType, reqEffects, effectKey, remapped } = resolveRequirement(hex);
        const vt = (hex.valueTarget && typeof hex.valueTarget === 'object') ? hex.valueTarget : null;
        const tier = vt?.tier || null;
        const reqKey = effectKey ? reqType + '|' + effectKey : reqType;
        const skew = vt ? `${+!!vt.r}${+!!vt.i}${+!!vt.t}` : '000';
        const key = `${reqKey}#${tier ?? 0}#${skew}`;

        let g = groups.get(key);
        if (!g) {
            g = {
                key, count: 0, reqType, reqEffects, tier, vt, reqKey,
                painted: remapped ? hex.baseType : null,
                labels: [],
            };
            groups.set(key, g);
        }
        g.count++;
        g.labels.push(label);
    }

    const demands = [...groups.values()];
    const cells = buildCells(pools, valueTierMap, { allowDuplicatesNoPlanet });
    const { plan, unfilled: skipped } = solveAssignment(demands, cells, costs);

    const cellByKey = new Map(cells.map(c => [c.key, c]));
    // Tiles are consumed from these copies, so one tile can never be placed twice. The
    // engine this replaced kept a flattened `anyPool` alongside the real buckets, over the
    // same object references, and a tile spliced out of one was still present in the other.
    const stock = new Map(cells.map(c =>
        [c.key, deterministic ? [...c.systems] : shuffle([...c.systems])]));

    const assignments = [];
    const tokenPlacements = [];
    const downgrades = [];
    const unmatched = [];
    const resolutions = [];

    for (const g of demands) {
        // Hexes inside a group are interchangeable by construction — same request, same
        // tier, same skew — so which one gets which tile is arbitrary. Shuffling keeps a
        // re-roll from producing the same map.
        const labels = deterministic ? [...g.labels] : shuffle([...g.labels]);
        const row = plan.get(g.key) || new Map();
        let at = 0;

        for (const [cellKey, howMany] of row) {
            const cell = cellByKey.get(cellKey);
            const bucket = stock.get(cellKey);

            for (let n = 0; n < howMany; n++) {
                const label = labels[at++];
                if (label === undefined) break;

                // Within the cell, the skew decides. Ties are broken randomly, or the first
                // entry wins in deterministic mode — without that a skewed target collapses
                // to one fixed pick and balanced mode's iterations become a no-op exactly
                // where they matter most.
                let idx = 0;
                if (bucket.length > 1) {
                    if (g.vt && (g.vt.r || g.vt.i || g.vt.t)) {
                        let best = -Infinity;
                        for (const s of bucket) best = Math.max(best, skewScore(s, g.vt));
                        const EPSILON = 0.5;
                        const contenders = [];
                        bucket.forEach((s, i) => {
                            if (skewScore(s, g.vt) >= best - EPSILON) contenders.push(i);
                        });
                        idx = deterministic
                            ? contenders[0]
                            : contenders[Math.floor(Math.random() * contenders.length)];
                    } else {
                        idx = deterministic ? 0 : bucket.length - 1;   // already shuffled
                    }
                }

                const sys = bucket[idx];
                bucket.splice(idx, 1);
                // Repeats are a fallback for exhaustion, so the cell is restocked only once
                // it runs dry — every distinct tile is spent before any is reused.
                if (cell.repeatable && !bucket.length) bucket.push(...cell.systems);

                assignments.push({ label, sys });

                const gotTier = valueTierMap
                    ? (valueTierMap.get(String(sys.id).toUpperCase()) ?? null)
                    : null;
                const record = outcome => resolutions.push({
                    label, reqKey: g.reqKey, reqType: g.reqType, reqEffects: g.reqEffects,
                    painted: g.painted, outcome, wantTier: g.tier, gotTier,
                });

                // Cover any requested effect the tile does not already provide with a token.
                // Only the missing ones — a substituted tile may carry some inherently, and
                // stacking a nebula token on a nebula tile just draws it twice.
                let tokened = false;
                if (g.reqEffects.length) {
                    const inherent = getSystemEffects(sys);
                    const missing = g.reqEffects.filter(e => !inherent.has(e));
                    if (missing.length) {
                        tokenPlacements.push({ label, effects: missing });
                        tokened = true;
                    }
                }

                const actualType = classifySystem(sys);
                const inChain = (DOWNGRADE_CHAIN[g.reqType] || []).includes(actualType);
                if (actualType !== g.reqType || tokened) {
                    downgrades.push({
                        label,
                        from: g.reqType,
                        to: actualType === g.reqType ? g.reqType : inChain ? actualType : 'token-fallback',
                        // The effect is the headline whenever one was asked for and had to be
                        // drawn on: that is the shortage the user can act on, even when the
                        // type changed underneath as well.
                        reason: tokened
                            ? `No '${g.reqEffects.join(',')}' tile left in the pool — used a '${actualType}' tile and drew the anomaly with a token.`
                            : inChain
                                ? `Not enough '${g.reqType}' systems to go round — this hex took a '${actualType}' system so the others could keep theirs.`
                                : `Nothing of a suitable type was left for a '${g.reqType}' hex — used a leftover '${actualType}' system as a last resort.`,
                    });
                }

                if (tokened) record('token');
                else if (actualType !== g.reqType) record('substituted');
                else record('exact');
            }
        }

        // Whatever the solver priced out of the map. Restricted types get their own wording:
        // running out means unfilled rather than close enough, by design.
        const left = skipped.get(g.key) || 0;
        for (let n = 0; n < left; n++) {
            const label = labels[at++];
            if (label === undefined) break;
            unmatched.push({
                label,
                reason: RESTRICTED_TYPES.has(g.reqType)
                    ? `No '${g.reqType}' tiles left in the pool. '${g.reqType}' hexes only accept '${g.reqType}' tiles, so this hex was left unfilled.`
                    : g.reqEffects.length
                        ? `Nothing left in the pool that could host a '${g.reqEffects.join(',')}' hex without adding an anomaly you didn't paint — left unfilled rather than placing the wrong one.`
                        : `No systems left in the pool for a '${g.reqType}' hex.`,
            });
            resolutions.push({
                label, reqKey: g.reqKey, reqType: g.reqType, reqEffects: g.reqEffects,
                painted: g.painted, outcome: 'unfilled', wantTier: g.tier, gotTier: null,
            });
        }
    }

    return { assignments, tokenPlacements, downgrades, unmatched, resolutions };
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
 *
 * Returns null when the map can't be scored — fewer than two placed home systems means
 * there is no spread to even out. Returning 0 instead made balanced mode silently keep
 * the first iteration and discard the rest, since no later score could beat it.
 */
function scoreAssignments(assignments, editor, { balanceRange = 2, weights = SCORING_WEIGHTS, settings = null } = {}) {
    const homes = Object.values(editor.hexes).filter(h => h.baseType === 'homesystem');
    if (homes.length < 2) return null;

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
 * @returns {{ assignments, tokenPlacements, downgrades, unmatched, score, info, notice }}
 *          `info` means nothing was produced and the caller should say so; `notice` means
 *          the fill succeeded but an option was ignored.
 */
/**
 * Rank the available pool into value tiers 1-5, per planet-count group.
 *
 * Tiers are percentiles, so tier 5 always means "the top fifth of what is currently
 * loaded" rather than an absolute quality — load another tile set and the boundaries move
 * with it. Two things follow that are worth knowing at the call sites:
 *
 *   - supply per tier is fixed at about a fifth of the group, so painting more than that
 *     many hexes at one tier cannot be satisfied no matter how good the solver is;
 *   - tiles of equal value can land either side of a boundary, purely on sort order.
 *
 * Grouping is by planet count so tier 5 means "best 2-planet system", not "best overall" —
 * the same grouping the on-map value overlay uses.
 *
 * @returns {Map<string, number>} upper-cased system id -> tier
 */
export function buildPoolTierMap(available, factors) {
    const groups = {};
    available.filter(s => s.id).forEach(s => {
        const g = getTypeGroup(s);
        if (!groups[g]) groups[g] = [];
        groups[g].push({ id: String(s.id).toUpperCase(), value: calculateSystemValue(s, factors) });
    });

    const tierMap = new Map();
    for (const entries of Object.values(groups)) {
        entries.sort((a, b) => a.value - b.value);
        const n = entries.length;
        entries.forEach(({ id }, idx) => {
            const pct = idx / n;
            tierMap.set(id, pct < 0.2 ? 1 : pct < 0.4 ? 2 : pct < 0.6 ? 3 : pct < 0.8 ? 4 : 5);
        });
    }
    return tierMap;
}

/**
 * Turn the panel's fallback settings into the solver's price list.
 *
 * @param {'down'|'nearest'|'up'} tierPolicy which direction to prefer when a tier runs out
 * @param {number|null} unfilledCost  what leaving a hex empty is worth; lower means the
 *                                    solver gives up sooner rather than substituting
 */
export function buildCosts(tierPolicy = 'down', unfilledCost = null) {
    const costs = { ...(TIER_POLICIES[tierPolicy] || TIER_POLICIES.down) };
    if (unfilledCost != null) costs.unfilledCost = unfilledCost;
    return costs;
}

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
    tierPolicy = 'down',
    unfilledCost = null,
} = {}) {
    const empty = { assignments: [], tokenPlacements: [], downgrades: [], unmatched: [], score: null };

    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    if (!unfilled.length) return { ...empty, info: 'No unfilled hexes found.' };

    const available = getAvailableSystems(editor, { includeWormholes, allowDuplicatesNoPlanet, includeHomeSystems, sources });
    if (!available.length) return {
        ...empty,
        unmatched: unfilled.map(h => ({ label: h.label, reason: 'No systems passed the current source filters.' })),
        info: 'No available systems found.',
    };

    const pools = buildPools(available);

    // Only rank the pool when something is actually asking for a tier.
    const anyTarget = unfilled.some(({ hex }) => hex.valueTarget);
    const valueTierMap = anyTarget
        ? buildPoolTierMap(available, getFactors(valueROn, valueIOn, valueTOn))
        : null;

    const costs = buildCosts(tierPolicy, unfilledCost);
    const attempt = () => tryAssign(unfilled, pools, valueTierMap, { allowDuplicatesNoPlanet, costs });

    if (!balanced) return { ...attempt(), score: null };

    // Balance scoring needs at least two placed home systems to have a spread to even out.
    // Say so rather than running `iterations` attempts and keeping the first regardless.
    const probe = attempt();
    const probeScore = scoreAssignments(probe.assignments, editor, { balanceRange, weights, settings });
    if (probeScore === null) {
        return { ...probe, score: null, notice: 'Balanced mode needs at least 2 placed home systems — filled without balance scoring.' };
    }

    let best = probe, bestScore = probeScore;
    for (let i = 1; i < iterations; i++) {
        const result = attempt();
        const score = scoreAssignments(result.assignments, editor, { balanceRange, weights, settings });
        if (score !== null && score < bestScore) { bestScore = score; best = result; }
    }
    return { ...best, score: bestScore };
}

/**
 * What the pool actually holds, per planet-count group and tier.
 *
 * This is the table that was missing. Tiers are percentiles, so each one holds about a
 * fifth of its group — roughly 8 two-planet systems per tier on the default set. Painting
 * twelve hexes at tier 5 is asking for something that does not exist, and until this was
 * shown there was nothing anywhere in the UI that said so.
 *
 * @returns {{group: string, tiers: number[], total: number, systems: Record<number, {id: string, name: string}[]>}[]}
 */
export function summariseTierSupply(available, tierMap) {
    const byGroup = new Map();
    for (const sys of available) {
        if (!sys.id) continue;
        const tier = tierMap.get(String(sys.id).toUpperCase());
        if (!tier) continue;
        const group = getTypeGroup(sys);
        if (!byGroup.has(group)) {
            byGroup.set(group, { group, tiers: [0, 0, 0, 0, 0], total: 0, systems: {} });
        }
        const row = byGroup.get(group);
        row.tiers[tier - 1]++;
        row.total++;
        if (!row.systems[tier]) row.systems[tier] = [];
        row.systems[tier].push({ id: String(sys.id), name: sys.name || String(sys.id) });
    }

    // Planet count ascending, with the oddities after, so the table reads like the rail.
    const ORDER = ['1', '2', '3+', 'legendary', 'home', 'empty'];
    return [...byGroup.values()].sort(
        (a, b) => (ORDER.indexOf(a.group) + 1 || 99) - (ORDER.indexOf(b.group) + 1 || 99));
}

/**
 * What the painted map is asking for, in the same shape as the supply table, so the two can
 * be read against each other.
 *
 * Demand is grouped by the tier map's own grouping rather than by the painted type, because
 * that is what the tiers are ranked within: a hex painted '3 planet' competes for the '3+'
 * group's tiers.
 *
 * @returns {{group: string, tiers: number[], total: number}[]}
 */
export function summariseTierDemand(unfilled) {
    const DEMAND_GROUP = {
        '1 planet': '1',
        '2 planet': '2',
        '3 planet': '3+',
        'legendary planet': 'legendary',
        'homesystem': 'home',
    };

    const byGroup = new Map();
    for (const { hex } of unfilled) {
        const tier = hex.valueTarget?.tier;
        if (!tier) continue;
        const group = DEMAND_GROUP[hex.baseType] || 'empty';
        if (!byGroup.has(group)) {
            byGroup.set(group, { group, tiers: [0, 0, 0, 0, 0], total: 0 });
        }
        const row = byGroup.get(group);
        row.tiers[tier - 1]++;
        row.total++;
    }
    return [...byGroup.values()];
}

/**
 * Analysis snapshot for the UI — what each painted hex is asking for, and what it will get.
 *
 * This is a DRY RUN, not a prediction. It performs a real (deterministic) assignment pass
 * and reports its outcome, because every version of this table that counted pool sizes
 * instead was a second implementation of the matching rules, and it drifted every time:
 *
 *   - it summed `special|asteroid` + `special|nebula` + … into one "special" number, so
 *     6 hexes wanting scar against 5 non-scar anomaly tiles read as a green tick while
 *     every one of them got a token;
 *   - it counted `1 planet|nebula` toward plain `1 planet` demand, which the fill cannot
 *     use, understating a 5-hex shortfall as 3.
 *
 * Rows are keyed exactly as buildPools keys supply, so "have" is the number of tiles that
 * match exactly — the only tier that gives the user what they painted.
 */
export function analyzeMap(editor, {
    includeHomeSystems = false, includeWormholes = false, allowDuplicatesNoPlanet = false,
    sources = null, valueROn = false, valueIOn = false, valueTOn = false,
    tierPolicy = 'down', unfilledCost = null,
} = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    const available = getAvailableSystems(editor, { includeWormholes, allowDuplicatesNoPlanet, includeHomeSystems, sources });
    const pools = buildPools(available);

    // The dry run used to be handed a null tier map, so the table could report every row
    // green while the fill delivered 40% of the tiers that were asked for. It reports on
    // the same ranking the fill will use.
    const anyTarget = unfilled.some(({ hex }) => hex.valueTarget);
    const valueTierMap = anyTarget
        ? buildPoolTierMap(available, getFactors(valueROn, valueIOn, valueTOn))
        : null;

    const dry = tryAssign(unfilled, pools, valueTierMap, {
        allowDuplicatesNoPlanet, deterministic: true, costs: buildCosts(tierPolicy, unfilledCost),
    });

    const byKey = new Map();
    for (const r of dry.resolutions) {
        let row = byKey.get(r.reqKey);
        if (!row) {
            row = {
                key: r.reqKey, type: r.reqType, effects: r.reqEffects,
                need: 0, exact: 0, token: 0, substituted: 0, unfilled: 0,
                have: (pools[r.reqKey] || []).length,
                wantTier: r.wantTier || null,
                tierExact: 0, tierMissed: 0,
                repeatable: allowDuplicatesNoPlanet && NO_PLANET_TYPES.has(r.reqType),
                restricted: RESTRICTED_TYPES.has(r.reqType),
                paintedAs: new Set(),
            };
            byKey.set(r.reqKey, row);
        }
        row.need++;
        row[r.outcome]++;
        if (r.painted) row.paintedAs.add(r.painted);
        if (r.wantTier) {
            if (r.gotTier === r.wantTier) row.tierExact++;
            else if (r.outcome !== 'unfilled') row.tierMissed++;
        }
    }

    const requirements = [...byKey.values()]
        .map(row => ({
            ...row,
            paintedAs: row.paintedAs.size ? [...row.paintedAs] : null,
            ok: row.exact === row.need && row.tierMissed === 0,
            // Nominally enough stock, yet some hexes still missed out — another requirement
            // reached the bucket first, usually an anomaly hex taking planet tiles as filler.
            // Without this the row reads as a contradiction: "need 6, have 6, 4 substituted".
            contended: row.have >= row.need && row.exact < row.need,
        }))
        // Problems first, then by type, so a short row can't hide below a screenful of ✅.
        .sort((a, b) => (a.ok - b.ok) || (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0) || a.key.localeCompare(b.key));

    return {
        totalUnfilled: unfilled.length,
        totalAvailable: available.length,
        requirements,
        tierSupply: valueTierMap ? summariseTierSupply(available, valueTierMap) : null,
        tierDemand: anyTarget ? summariseTierDemand(unfilled) : null,
        canFill: unfilled.length > 0,
        hasHomeSystems: Object.values(editor.hexes).some(h => h.baseType === 'homesystem'),
        // Balance scoring needs two homes to have a spread between them.
        canBalance: Object.values(editor.hexes).filter(h => h.baseType === 'homesystem').length >= 2,
        systemsLoaded: !!(editor.allSystems?.length),
    };
}
