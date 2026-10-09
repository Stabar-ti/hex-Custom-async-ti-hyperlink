/**
 * AutoMapper assignment — a transportation problem, solved to optimality.
 *
 * WHY THIS EXISTS
 *
 * The engine this replaces walked the painted hexes one at a time and let each greedily
 * take the best tile still in the pool. Greedy assignment is order-dependent, and the order
 * was `Object.entries(editor.hexes)` — map generation order, which the user cannot see or
 * control. Measured on the real tile set: twelve hexes asking for tier 5 and eight asking
 * for tier 4, against a supply of eight each, scored 60% exact tier hits when the tier-5
 * hexes happened to be listed first and 80% when they were listed last. The 80% is optimal.
 * The 20 points between them were nothing but list order — the overflowing tier-5 hexes ate
 * the tier-4 stock the tier-4 hexes needed, because a greedy pass cannot see a hex it has
 * not reached yet.
 *
 * It also had no tier fallback. Selection tried the exact tier, then plus or minus one, then
 * the whole bucket with the tier ignored — a uniform random draw. Asking for 20 tier-5 tiles
 * against a supply of 8 gave 40% tier 5, 40% tier 4, and the remaining 20% spread over tiers
 * 1 to 3 in proportion to how many of each happened to exist.
 *
 * THE MODEL
 *
 * Hexes asking for the same thing are interchangeable, and so are tiles in the same
 * (type, effects, tier) cell. So this is not a 120x550 matching problem — it is a small
 * transportation problem between a few dozen demand groups and a few dozen supply cells,
 * which min-cost max-flow solves exactly in about a millisecond.
 *
 *   source --cap n--> demand group --cap n, cost c--> supply cell --cap m--> sink
 *                          |
 *                          +--cap n, cost UNFILLED--> sink
 *
 * Every policy question is a number in the cost function rather than a branch in the code:
 *
 *   "prefer downgrading a tier over upgrading"  -> tierDown < tierUp
 *   "rather leave it empty than get it wrong"   -> lower unfilledCost
 *   "type matters more than tier"               -> typeStep much greater than tierDown
 *
 * "Leave the hex empty" is an ordinary edge with a price. If every real tile costs more than
 * that price the solver leaves the hex alone by itself; there is no special case for it
 * anywhere below.
 *
 * WHAT IT DOES NOT DECIDE
 *
 * Which individual tile comes out of a chosen cell. Every tile in a cell has the same type,
 * the same effects and the same tier, so the global cost cannot tell them apart; the R/I/T
 * skew picks between them afterwards, within the cell. That is a local choice by
 * construction, not an approximation.
 */

/** Position in the type-downgrade chain, and so what may substitute for what. */
export const DOWNGRADE_CHAIN = {
    '3 planet': ['3 planet', '2 planet', '1 planet'],
    '2 planet': ['2 planet', '1 planet'],
    '1 planet': ['1 planet'],
    'legendary planet': ['legendary planet', '2 planet', '1 planet'],
    'special': ['empty'],
    'empty': ['empty'],
    'homesystem': ['homesystem'],
    'fracture': ['fracture'],
};

/** Hex types that only ever accept their own tile type, in both directions. */
export const RESTRICTED_TYPES = new Set(['homesystem', 'fracture']);

/**
 * How far apart two tile types are. Used to rank last-resort filler by how much it
 * resembles the request, and by the analysis table to sort the biggest types first.
 */
export const TYPE_RANK = {
    'empty': 0, 'special': 0,
    '1 planet': 1, '2 planet': 2, '3 planet': 3,
    'legendary planet': 9,
};

/**
 * The price list. Each of these is an ordering claim, not a tuned constant.
 *
 * typeStep dominates everything else because the painted type is a structural decision — a
 * hex drawn as a 2-planet system is part of the map's shape — while the tier is a
 * preference. A solver that traded a planet count for a tier would be answering a different
 * question than the one that was asked.
 */
export const DEFAULT_COSTS = {
    typeStep: 50,        // per step down the downgrade chain
    lastResort: 400,     // a type outside the chain entirely, used as filler
    tokenPerEffect: 30,  // an anomaly drawn as a token instead of being the tile
    tierDown: 2,         // per tier below the one asked for
    tierUp: 6,           // per tier above — "too good" still misses the brief
    unfilledCost: 1000,  // the price of leaving a hex alone
};

/** Fallback direction presets, applied over DEFAULT_COSTS. */
export const TIER_POLICIES = {
    down: { tierDown: 2, tierUp: 6 },
    nearest: { tierDown: 3, tierUp: 3 },
    up: { tierDown: 6, tierUp: 2 },
};

/**
 * "Leave it empty rather than miss by more than one tier."
 *
 * Expressed as prices, not as a rule: tier steps are scaled up until two of them cost more
 * than an empty hex, while one still costs less. Everything else keeps its usual place
 * under that ceiling, so a token (30) and a single step down the type chain (50) are still
 * accepted, and a last-resort tile (400+) still is not.
 *
 * A single low unfilledCost cannot express this. Tier steps cost 2 and a type step costs
 * 50, so any threshold that separates one tier from two also sits far below the type and
 * token band and would refuse those as well.
 */
export const STRICT_TIERS = {
    tierDown: 35,
    tierUp: 35,
    unfilledCost: 60,
};

// ── Min-cost max-flow ────────────────────────────────────────────────────────
//
// Successive shortest paths with SPFA. The graph is tiny — tens of nodes, a few thousand
// edges — and each augmentation pushes as much as the path allows rather than one unit, so
// the iteration count is bounded by the number of distinct routes rather than by the number
// of hexes. Costs are integers, so path comparisons are exact.

class MinCostFlow {
    /** @param {number} n node count */
    constructor(n) {
        this.n = n;
        /** @type {{to: number, cap: number, cost: number, rev: number}[][]} */
        this.g = Array.from({ length: n }, () => []);
    }

    addEdge(from, to, cap, cost) {
        this.g[from].push({ to, cap, cost, rev: this.g[to].length });
        this.g[to].push({ to: from, cap: 0, cost: -cost, rev: this.g[from].length - 1 });
    }

    /**
     * Push up to `maxFlow` units from s to t as cheaply as possible.
     * @returns {{flow: number, cost: number}}
     */
    run(s, t, maxFlow) {
        let flow = 0;
        let cost = 0;

        while (flow < maxFlow) {
            const dist = new Array(this.n).fill(Infinity);
            const inQueue = new Array(this.n).fill(false);
            const prevNode = new Array(this.n).fill(-1);
            const prevEdge = new Array(this.n).fill(-1);

            dist[s] = 0;
            const queue = [s];
            inQueue[s] = true;

            while (queue.length) {
                const v = queue.shift();
                inQueue[v] = false;
                const edges = this.g[v];
                for (let i = 0; i < edges.length; i++) {
                    const e = edges[i];
                    if (e.cap <= 0) continue;
                    const nd = dist[v] + e.cost;
                    if (nd < dist[e.to]) {
                        dist[e.to] = nd;
                        prevNode[e.to] = v;
                        prevEdge[e.to] = i;
                        if (!inQueue[e.to]) {
                            queue.push(e.to);
                            inQueue[e.to] = true;
                        }
                    }
                }
            }

            if (dist[t] === Infinity) break;   // sink unreachable: nothing left to push

            let push = maxFlow - flow;
            for (let v = t; v !== s; v = prevNode[v]) {
                push = Math.min(push, this.g[prevNode[v]][prevEdge[v]].cap);
            }
            for (let v = t; v !== s; v = prevNode[v]) {
                const e = this.g[prevNode[v]][prevEdge[v]];
                e.cap -= push;
                this.g[v][e.rev].cap += push;
            }

            flow += push;
            cost += push * dist[t];
        }

        return { flow, cost };
    }

    /** How much flow ended up on the edge added as the `idx`-th out-edge of `from`. */
    flowOn(from, idx, originalCap) {
        return originalCap - this.g[from][idx].cap;
    }
}

// ── Cost model ───────────────────────────────────────────────────────────────

/**
 * What one demand group pays to be served by one supply cell, or null if the pairing is not
 * allowed at all.
 *
 * Two rules carry over from the engine this replaces, and both are exclusions rather than
 * preferences, so they are `null` rather than a large number:
 *
 *   - A restricted type pairs only with itself. Running out means unfilled, not "close
 *     enough" — dropping a faction homeworld on an ordinary hex is not a worse match, it is
 *     a different map.
 *   - A tile may not bring an anomaly the hex was not painted with, so its effects must be a
 *     subset of the requested ones. Adding a nebula nobody asked for changes the board.
 *
 * @param {{reqType: string, reqEffects: string[], effectSet: Set<string>, tier: number|null}} demand
 * @param {{type: string, effects: Set<string>, tier: number|null}} cell
 * @param {typeof DEFAULT_COSTS} costs
 * @returns {number|null}
 */
export function pairCost(demand, cell, costs) {
    if (RESTRICTED_TYPES.has(demand.reqType) || RESTRICTED_TYPES.has(cell.type)) {
        if (demand.reqType !== cell.type) return null;
    }

    for (const e of cell.effects) {
        if (!demand.effectSet.has(e)) return null;
    }

    let cost = 0;

    // ── Type ──
    // The tile the hex was painted for always costs nothing, whether or not the chain
    // happens to list it. 'special' does not list itself — the engine this replaces matched
    // the exact effect key in a separate step before ever consulting the chain, so the data
    // never needed to — and reading the chain alone priced a real nebula tile on a nebula
    // hex as last-resort filler.
    const chain = DOWNGRADE_CHAIN[demand.reqType] || [demand.reqType];
    const step = cell.type === demand.reqType ? 0 : chain.indexOf(cell.type);
    if (step >= 0) {
        cost += step * costs.typeStep;
    } else {
        // Outside the chain: filler. Ranked by how far the type is from the request, so
        // leftovers at least resemble what was asked for.
        const dist = Math.abs((TYPE_RANK[cell.type] ?? 0) - (TYPE_RANK[demand.reqType] ?? 0));
        cost += costs.lastResort + dist * costs.typeStep;
    }

    // ── Effects ──
    // Anything the hex asked for that this tile does not carry gets drawn as a token.
    let missing = 0;
    for (const e of demand.reqEffects) {
        if (!cell.effects.has(e)) missing++;
    }
    cost += missing * costs.tokenPerEffect;

    // ── Tier ──
    // A planet-free tile has no meaningful value tier: calculateSystemValue returns 0 for
    // every one of them, so their order within the 'empty' group is sort order, not quality.
    // Charging a tier penalty against that would be inventing a preference.
    if (demand.tier && cell.tier) {
        const d = cell.tier - demand.tier;
        cost += d < 0 ? -d * costs.tierDown : d * costs.tierUp;
    }

    return cost;
}

// ── The solver ───────────────────────────────────────────────────────────────

/**
 * Assign supply cells to demand groups at minimum total cost.
 *
 * @param {{key: string, count: number, reqType: string, reqEffects: string[], tier: number|null}[]} demands
 * @param {{key: string, type: string, effects: Set<string>, tier: number|null, count: number, repeatable?: boolean}[]} cells
 * @param {Partial<typeof DEFAULT_COSTS>} [costOverrides]
 * @returns {{plan: Map<string, Map<string, number>>, unfilled: Map<string, number>, cost: number}}
 *          plan maps a demand key to the cells serving it and how many hexes each covers.
 */
export function solveAssignment(demands, cells, costOverrides = {}) {
    const costs = { ...DEFAULT_COSTS, ...costOverrides };
    const prepared = demands.map(d => ({ ...d, effectSet: new Set(d.reqEffects) }));

    const totalDemand = prepared.reduce((s, d) => s + d.count, 0);
    if (!totalDemand) return { plan: new Map(), unfilled: new Map(), cost: 0 };

    const S = 0;
    const D0 = 1;
    const C0 = D0 + prepared.length;
    const T = C0 + cells.length;
    const mcf = new MinCostFlow(T + 1);

    prepared.forEach((d, i) => mcf.addEdge(S, D0 + i, d.count, 0));

    // A repeatable cell — planet-free tiles under "duplicate empty/anomaly" — can serve any
    // amount of demand out of its stock.
    cells.forEach((c, j) =>
        mcf.addEdge(C0 + j, T, c.repeatable ? totalDemand : c.count, 0));

    /** @type {{d: number, edgeIdx: number, cellIdx: number, cap: number}[]} */
    const assignEdges = [];
    /** @type {{d: number, edgeIdx: number, cap: number}[]} */
    const skipEdges = [];

    prepared.forEach((d, i) => {
        cells.forEach((c, j) => {
            const cost = pairCost(d, c, costs);
            if (cost === null) return;
            assignEdges.push({ d: i, edgeIdx: mcf.g[D0 + i].length, cellIdx: j, cap: d.count });
            mcf.addEdge(D0 + i, C0 + j, d.count, cost);
        });
        skipEdges.push({ d: i, edgeIdx: mcf.g[D0 + i].length, cap: d.count });
        mcf.addEdge(D0 + i, T, d.count, costs.unfilledCost);
    });

    const { cost } = mcf.run(S, T, totalDemand);

    const plan = new Map();
    for (const { d, edgeIdx, cellIdx, cap } of assignEdges) {
        const used = mcf.flowOn(D0 + d, edgeIdx, cap);
        if (used <= 0) continue;
        const key = prepared[d].key;
        if (!plan.has(key)) plan.set(key, new Map());
        const row = plan.get(key);
        row.set(cells[cellIdx].key, (row.get(cells[cellIdx].key) || 0) + used);
    }

    const unfilled = new Map();
    for (const { d, edgeIdx, cap } of skipEdges) {
        const used = mcf.flowOn(D0 + d, edgeIdx, cap);
        if (used > 0) unfilled.set(prepared[d].key, used);
    }

    return { plan, unfilled, cost };
}
