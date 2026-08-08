/**
 * AutoMapper Core — fills unfilled hexes with real TI4 systems.
 * "Unfilled" = hex has baseType set (via Draw Helpers) but no realId.
 */

import { passesAutoMapperFilters } from '../../ui/uiFilters.js';
import { calculateSystemValue, getFactors, getTypeGroup } from '../../features/valueOverlay.js';
import { hasFactionHomeworld } from '../SystemPicker/pickerModel.js';

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
    if (sys.tileBack === 'fracture') return 'fracture';
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

// ---- Downgrade chain: if no systems of required type, try these in order ----
// A bare 'special' key never exists in the pool — classifySystem only returns 'special' for
// systems carrying an anomaly flag, and those always get an effect suffix — so a 'special'
// request that couldn't be met by its exact effect bucket falls to a plain 'empty' tile
// and has the anomaly drawn on with a token. Deliberately NOT another anomaly: putting a
// nebula tile on a hex painted asteroid is a worse answer than an asteroid token.
const DOWNGRADE_CHAIN = {
    '3 planet':         ['3 planet', '2 planet', '1 planet'],
    '2 planet':         ['2 planet', '1 planet'],
    '1 planet':         ['1 planet'],
    'legendary planet': ['legendary planet', '2 planet', '1 planet'],
    'special':          ['empty'],
    'empty':            ['empty'],
    'homesystem':       ['homesystem'],
    'fracture':         ['fracture'],  // fracture positions only accept fracture tiles — no downgrade
};

/**
 * Types that may only ever be filled by a system of that same type. They are excluded
 * from the last-resort fallback in both directions: a homesystem/fracture tile is never
 * used to fill something else, and such a hex is never filled with something else.
 * Running out means "unmatched", not "close enough".
 */
const RESTRICTED_TYPES = new Set(['homesystem', 'fracture']);

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

// Make a deep-copy of pools for one assignment attempt. `deterministic` skips the shuffle
// so the analysis pass produces the same counts on every render — a Type breakdown that
// flickers between numbers as you toggle an unrelated option is worse than no breakdown.
function copyPools(pools, deterministic = false) {
    const copy = {};
    for (const [k, arr] of Object.entries(pools)) copy[k] = deterministic ? [...arr] : shuffle([...arr]);
    return copy;
}

// ---- Assignment engine ----

/**
 * Choose an index within a bucket given a {tier, r, i, t} preference.
 *
 * Priority:
 *  1. Exact tier match, then ranked by R/I/T skew score
 *  2. Adjacent tier (±1), ranked by skew score
 *  3. Any system — pick highest skew score
 *
 * Ties are broken randomly. Without that, a skewed value target collapses to a
 * deterministic greedy pick and every balanced-mode iteration produces the same
 * assignment for those hexes, which made `iterations` a no-op wherever it mattered most.
 */
function chooseIndex(bucket, vt, valueTierMap, deterministic = false) {
    if (!bucket.length) return -1;
    // The bucket is already shuffled, so the last entry is a uniform random draw.
    if (!vt || !valueTierMap) return deterministic ? 0 : bucket.length - 1;

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
    if (!pool.length) return deterministic ? 0 : bucket.length - 1;

    // Best skew score within the chosen tier band, then a uniform draw among near-ties.
    let bestScore = -Infinity;
    for (const s of pool) bestScore = Math.max(bestScore, skewScore(s));
    const EPSILON = 0.5;
    const contenders = pool.filter(s => skewScore(s) >= bestScore - EPSILON);
    const winner = deterministic ? contenders[0] : contenders[Math.floor(Math.random() * contenders.length)];

    return bucket.indexOf(winner);
}

/**
 * Remove and return one system from `pools[key]`, or null if that bucket is empty.
 *
 * The ONLY function permitted to consume from a pool. The previous engine kept a
 * `flatMap`ped `anyPool` alongside the real buckets — a separate array over the same
 * object references — so a system spliced out of one was still present in the other and
 * could be placed on two hexes. Routing every consumption through here is what makes
 * "each tile is used once" enforceable rather than merely intended.
 *
 * The take is unconditional, including under `allowDuplicatesNoPlanet`. Leaving a
 * repeatable system in the bucket instead looked equivalent and was not: with no value
 * target, chooseIndex always returns the last index, so the same tile came back on every
 * call and a map with 22 distinct empty tiles available got one of them twelve times.
 * Repeats are a fallback for exhaustion, so the bucket is restocked only once it runs
 * dry — every distinct tile is spent before any is reused.
 */
function takeSystem(pools, key, vt, valueTierMap, { allowDuplicatesNoPlanet = false, seed = null, deterministic = false } = {}) {
    const bucket = pools[key];
    if (!bucket?.length) return null;

    const idx = chooseIndex(bucket, vt, valueTierMap, deterministic);
    if (idx < 0) return null;

    const sys = bucket[idx];
    bucket.splice(idx, 1);

    if (allowDuplicatesNoPlanet && !bucket.length && seed) {
        // Only planet-free tiles may come back — repeating a planet system would change
        // the map's resource total, which is never what this option is asking for.
        const repeatable = (seed[key] || []).filter(s => !s.planets?.length);
        if (repeatable.length) bucket.push(...(deterministic ? [...repeatable] : shuffle([...repeatable])));
    }
    return sys;
}

/**
 * How far apart two tile types are, for choosing filler. Planet count is the axis the
 * map designer actually cares about, so a 1-planet hex short of stock should reach for a
 * 2-planet tile long before a 3-planet one.
 *
 * Legendary sits at the far end deliberately. It is a scarce, game-defining tile, and
 * dropping Primor onto a hex someone painted "1 planet" is a balance change, not a
 * near-miss — so it ranks below every ordinary alternative and is only ever used when
 * nothing else is left.
 */
const TYPE_RANK = {
    'empty': 0, 'special': 0,
    '1 planet': 1, '2 planet': 2, '3 planet': 3,
    'legendary planet': 9,
};

/**
 * Pool keys eligible for the last-resort fallback, best-fitting first.
 *
 * Two hard exclusions, then a ranking:
 *
 *   - Restricted types are never filler for anything.
 *   - The tile's own effects must be a SUBSET of what the hex asked for. This is a filter,
 *     not a preference. Ranking incompatible buckets last still placed them once compatible
 *     stock ran out: a hex painted 'asteroid' would take the last rift tile and then have an
 *     asteroid token dropped on top, ending up showing both anomalies — one of which nobody
 *     painted. An unfilled hex is reported and obvious; a surprise anomaly is neither.
 *
 * What remains is ranked by distance from the requested type (see TYPE_RANK), so filler
 * resembles the request, then by bucket size so plentiful stock is spent before scarce.
 * Ranking used to be "whatever order Object.keys returned", which made every clean bucket
 * interchangeable: ten hexes painted '1 planet' against a short PoK pool came back holding
 * Primor and Hope's End.
 */
function fallbackKeys(pools, reqType, reqEffects) {
    const reqEffectSet = new Set(reqEffects);
    const wantRank = TYPE_RANK[reqType] ?? 0;

    return Object.keys(pools)
        .filter(key => {
            if (!pools[key].length) return false;
            const [type, effectPart] = key.split('|');
            if (RESTRICTED_TYPES.has(type)) return false;
            const effects = effectPart ? effectPart.split(',') : [];
            return effects.every(e => reqEffectSet.has(e));
        })
        .map(key => ({
            key,
            distance: Math.abs((TYPE_RANK[key.split('|')[0]] ?? 0) - wantRank),
            size: pools[key].length,
        }))
        .sort((a, b) =>
            a.distance - b.distance ||
            b.size - a.size ||
            a.key.localeCompare(b.key))     // stable, so the analysis pass is reproducible
        .map(c => c.key);
}

/**
 * One assignment attempt. Returns:
 *   assignments:      [{label, sys}]
 *   tokenPlacements:  [{label, effects: []}]  — apply effects via applyEffect after assignSystem
 *   downgrades:       [{label, from, to}]
 *   unmatched:        [{label, reason}]
 *   resolutions:      [{label, reqKey, reqType, reqEffects, painted, outcome}]
 *
 * `resolutions` is what the Type breakdown is built from. Reporting the outcome of a real
 * assignment pass, rather than predicting one from pool sizes, is the only way the panel
 * and the fill cannot disagree — every previous version of that table was a second,
 * drifting implementation of these matching rules.
 *
 * outcome is one of:
 *   'exact'       — the tile the hex was painted for
 *   'token'       — right kind of tile, but the anomaly is drawn with a token
 *   'substituted' — a different tile type was used
 *   (hexes with no assignment are listed in `unmatched` instead)
 */
function tryAssign(unfilled, pools, valueTierMap = null, { allowDuplicatesNoPlanet = false, deterministic = false } = {}) {
    const p = copyPools(pools, deterministic);

    const assignments = [];
    const tokenPlacements = [];
    const downgrades = [];
    const unmatched = [];
    const resolutions = [];
    // `pools` is the untouched master copy — takeSystem restocks a drained bucket from it
    // when repeats are allowed.
    const take = (key, vt) => takeSystem(p, key, vt, valueTierMap, { allowDuplicatesNoPlanet, seed: pools, deterministic });

    for (const { label, hex } of unfilled) {
        const { reqType, reqEffects, effectKey, remapped } = resolveRequirement(hex);
        const vt = (hex.valueTarget && typeof hex.valueTarget === 'object') ? hex.valueTarget : null;
        const reqKey = effectKey ? `${reqType}|${effectKey}` : reqType;
        const record = outcome => resolutions.push({
            label, reqKey, reqType, reqEffects,
            painted: remapped ? hex.baseType : null,
            outcome,
        });

        // 1. Try exact-effect-matched system first.
        let assigned = null;
        if (effectKey) {
            const sys = take(reqKey, vt);
            if (sys) assigned = { sys, usedEffect: effectKey };
        }

        // 2. Fall back to clean system of the same/downgraded type. Downgrades are reported
        //    against the RESOLVED type — comparing against hex.baseType flagged every plain
        //    'special' hex as a failed downgrade when 'special' → 'empty' is the intent.
        if (!assigned) {
            for (const tryType of (DOWNGRADE_CHAIN[reqType] || [reqType])) {
                const sys = take(tryType, vt);
                if (!sys) continue;
                assigned = { sys, usedEffect: null };
                if (tryType !== reqType) downgrades.push({
                    label, from: reqType, to: tryType,
                    // Say which shortage actually bit. For an anomaly hex the type was fine
                    // and the effect was not, and "no 'special' systems left" reads as though
                    // the whole category were empty.
                    reason: effectKey
                        ? `No '${effectKey}' tile left in the pool — used a plain '${tryType}' tile and drew the anomaly with a token.`
                        : `No '${reqType}' systems left in the pool — used a '${tryType}' system instead.`,
                });
                break;
            }
        }

        // 3. Token-only fallback: no system of any suitable type is left, so use whatever
        //    remains and cover the requested effects with anomaly tokens. Restricted types
        //    never reach here — a fracture or home-system hex that can't be filled properly
        //    is left alone rather than quietly given an ordinary tile.
        if (!assigned && !RESTRICTED_TYPES.has(reqType)) {
            for (const key of fallbackKeys(p, reqType, reqEffects)) {
                const sys = take(key, null);
                if (!sys) continue;
                assigned = { sys, usedEffect: null };
                downgrades.push({
                    label, from: reqType, to: 'token-fallback',
                    reason: `No '${reqType}' (or downgraded) systems left in the pool — used a leftover '${classifySystem(sys)}' system as a last resort.`,
                });
                break;
            }
        }

        if (!assigned) {
            unmatched.push({
                label,
                reason: RESTRICTED_TYPES.has(reqType)
                    ? `No '${reqType}' tiles left in the pool. '${reqType}' hexes only accept '${reqType}' tiles, so this hex was left unfilled.`
                    : effectKey
                        ? `Nothing left in the pool that could host a '${effectKey}' hex without adding an anomaly you didn't paint — left unfilled rather than placing the wrong one.`
                        : `No systems left in the pool for a '${reqType}' hex.`,
            });
            record('unfilled');
            continue;
        }

        assignments.push({ label, sys: assigned.sys });

        // Cover any requested effect the assigned system doesn't already provide with an
        // anomaly token. Only the missing ones — a fallback system may carry some of them
        // inherently, and stacking a nebula token on a nebula tile just draws it twice.
        let tokened = false;
        if (reqEffects.length > 0 && !assigned.usedEffect) {
            const inherent = getSystemEffects(assigned.sys);
            const missing = reqEffects.filter(e => !inherent.has(e));
            if (missing.length) { tokenPlacements.push({ label, effects: missing }); tokened = true; }
        }

        // An anomaly drawn with a token is the headline for that hex even though the type
        // also changed underneath — "you'll get an asteroid token" is what the user acts on.
        if (tokened) record('token');
        else if (classifySystem(assigned.sys) !== reqType) record('substituted');
        else record('exact');
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

    const attempt = () => tryAssign(unfilled, pools, valueTierMap, { allowDuplicatesNoPlanet });

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
export function analyzeMap(editor, { includeHomeSystems = false, includeWormholes = false, allowDuplicatesNoPlanet = false, sources = null } = {}) {
    const unfilled = getUnfilledHexes(editor, { includeHomeSystems });
    const available = getAvailableSystems(editor, { includeWormholes, allowDuplicatesNoPlanet, includeHomeSystems, sources });
    const pools = buildPools(available);

    const dry = tryAssign(unfilled, pools, null, { allowDuplicatesNoPlanet, deterministic: true });

    const byKey = new Map();
    for (const r of dry.resolutions) {
        let row = byKey.get(r.reqKey);
        if (!row) {
            row = {
                key: r.reqKey, type: r.reqType, effects: r.reqEffects,
                need: 0, exact: 0, token: 0, substituted: 0, unfilled: 0,
                have: (pools[r.reqKey] || []).length,
                repeatable: allowDuplicatesNoPlanet && NO_PLANET_TYPES.has(r.reqType),
                restricted: RESTRICTED_TYPES.has(r.reqType),
                paintedAs: new Set(),
            };
            byKey.set(r.reqKey, row);
        }
        row.need++;
        row[r.outcome]++;
        if (r.painted) row.paintedAs.add(r.painted);
    }

    const requirements = [...byKey.values()]
        .map(row => ({
            ...row,
            paintedAs: row.paintedAs.size ? [...row.paintedAs] : null,
            ok: row.exact === row.need,
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
        canFill: unfilled.length > 0,
        hasHomeSystems: Object.values(editor.hexes).some(h => h.baseType === 'homesystem'),
        // Balance scoring needs two homes to have a spread between them.
        canBalance: Object.values(editor.hexes).filter(h => h.baseType === 'homesystem').length >= 2,
        systemsLoaded: !!(editor.allSystems?.length),
    };
}
