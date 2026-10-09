// src/features/valueOverlay.js
// Value tier overlay (1–5) for assigned system hexes.
// Each hex gets a coloured semi-transparent fill and a tier badge for where its Milty value
// falls among the placed systems of its planet-count group.

const SVG_NS = 'http://www.w3.org/2000/svg';

import { hexPoints } from '../utils/hexGeometry.js';
import { biasedWeights, flexWeightOf, getWeights, subscribeWeights, tileScore } from '../modules/Milty/miltyScore.js';

/** Semi-transparent fill per tier (red → green) */
const TIER_FILL = {
    1: 'rgba(220, 50,  50,  0.30)',
    2: 'rgba(230, 140, 40,  0.30)',
    3: 'rgba(220, 210, 60,  0.30)',
    4: 'rgba(130, 200, 60,  0.30)',
    5: 'rgba(40,  180, 80,  0.30)',
};

/** Badge text colour per tier */
const TIER_TEXT = {
    1: '#ff4444',
    2: '#ff8c00',
    3: '#ccaa00',
    4: '#55aa00',
    5: '#008800',
};

/**
 * Derive weighting factors from three boolean toggles.
 * With no toggles → standard milty scoring (f_R=1, f_I=1, f_T=2).
 * Toggling R or I boosts that stat and slightly penalises the other.
 * Toggling T raises the tech multiplier.
 */
export function getFactors(rOn, iOn, tOn) {
    let f_R = 1.0, f_I = 1.0, f_T = 2.0;
    if (rOn) f_R += 0.6;
    if (iOn) f_I += 0.6;
    if (tOn) f_T += 1.5;
    if (rOn && !iOn) f_I = Math.max(0.2, f_I - 0.4);
    if (iOn && !rOn) f_R = Math.max(0.2, f_R - 0.4);
    return { f_R, f_I, f_T };
}

/**
 * The weights a tile's value is computed with: the Milty weights, with the R / I / T bias
 * of `factors` applied (see getFactors). Unbiased, these are exactly the Weighting Settings.
 */
export function valueWeights(factors = {}) {
    return biasedWeights(getWeights(), factors);
}

/** The weight a flex point carries under `factors`: the average of the R and I weights. */
export function flexWeight(factors = {}) {
    return flexWeightOf(valueWeights(factors));
}

/**
 * The pieces a system's value is made of, as well as the value itself.
 *
 * The value is the tile's Milty value (miltyScore.tileScore): its share of the score of
 * any Milty slice it sits in. Resources and influence count at their optimal use — R, I
 * and F (flex) — and tech skips, legendary planets, wormholes, trade stations, planet
 * traits and anomalies each carry their Milty weight. `terms` are what each is worth and
 * add up to `value`. The two slice-only terms, R/I imbalance and planet count, are not in
 * a tile's value; see miltyScore.
 *
 * The AutoMapper's pool view shows these parts next to each tile, so a tier can be traced
 * back to what earned it. calculateSystemValue is this function's `value`, so the parts
 * shown are always the ones the ranking used.
 */
export function systemValueParts(sys, factors = {}) {
    const s = tileScore(sys, valueWeights(factors));
    return {
        ...s.parts,
        legendary: s.parts.legendaries.length > 0,
        terms: s.terms,
        value: s.value,
    };
}

/** A system's Milty value under the R / I / T bias of `factors`. */
export function calculateSystemValue(sys, factors = {}) {
    return systemValueParts(sys, factors).value;
}

/**
 * Classify a system into a type group for per-group scaling.
 * 1p / 2p / 3p+ / legendary / empty each get their own set of value bands
 * so "tier 5" always means "best of that planet count", not "best overall".
 */
export function getTypeGroup(sys) {
    const planets = Array.isArray(sys?.planets) ? sys.planets : [];
    if (planets.some(p => p.legendaryAbilityName && p.legendaryAbilityText)) return 'legendary';
    if (planets.some(p => p.planetType === 'FACTION')) return 'home';
    if (planets.length >= 3) return '3+';
    if (planets.length === 2) return '2';
    if (planets.length === 1) return '1';
    return 'empty';
}

/**
 * The tier a value falls in, when the range `lo`…`hi` is cut into five equal bands.
 *
 * Tiers are fifths of the VALUE range, not fifths of the tiles. A group running from 3 to
 * 8 has bands one point wide — T1 is 3 up to 4, T5 is 7 to 8 — and however many tiles
 * score in a band, that is how many the tier holds. So two tiles with the same value are
 * always the same tier, and the tiers take the shape of the pool rather than forcing an
 * even count onto it.
 *
 * They used to be fifths of the tiles, cut by position after sorting, which split runs of
 * equal values across a tier line by nothing but their order in the tile list: of the ten
 * 2-planet tiles on the default pool scoring 6, eight were T4 and two T5.
 *
 * Each band includes its lower edge; the top band includes `hi` as well. With nothing to
 * compare against (`lo === hi`) every value is the middle tier. The small epsilon keeps a
 * value that sits on an edge from dropping a band through floating-point noise — biased
 * factors give values like 3.3000000000000003.
 *
 * @returns {1|2|3|4|5}
 */
export function valueBandTier(value, lo, hi) {
    if (!(hi > lo)) return 3;
    const t = Math.floor(((value - lo) * 5) / (hi - lo) + 1e-9) + 1;
    return /** @type {1|2|3|4|5} */ (Math.max(1, Math.min(5, t)));
}

/** The six edges of the five bands over `lo`…`hi`: band k runs from edges[k-1] to edges[k]. */
export function valueBandEdges(lo, hi) {
    return Array.from({ length: 6 }, (_, k) => lo + ((hi - lo) * k) / 5);
}

/**
 * Score every placed system and return Map<hexLabel, {tier, value}>.
 * Tiers are computed SEPARATELY per type group (1-planet, 2-planet, 3+-planet, etc.)
 * so tier 5 always means "best available of that planet count", not "best overall".
 * They are the same value bands the AutoMapper ranks its pool with (valueBandTier).
 *
 * A tile without planets is ranked only if the Milty weights give it a value — a scar, a
 * wormhole, a supernova — and then only against the other planet-free tiles. A plain empty
 * system and a hyperlane are worth nothing, so they get no tier and no badge. They used to
 * be cut into T1–T5 like any other group: every one scored 0, so their tiers came from
 * nothing but the order the hexes happened to be listed in, and identical empty tiles
 * showed different tiers.
 */
export function buildValueTiers(editor, factors) {
    const lookup = editor.sectorIDLookup || {};
    const groups = {};

    for (const [label, hex] of Object.entries(editor.hexes)) {
        if (!hex.realId) continue;
        const sys = lookup[hex.realId.toString().toUpperCase()];
        if (!sys) continue;
        if (sys.isHyperlane) continue;
        const group = getTypeGroup(sys);
        const value = calculateSystemValue(sys, factors);
        if (group === 'empty' && value === 0) continue;
        if (!groups[group]) groups[group] = [];
        groups[group].push({ key: label, value });
    }

    const tierMap = new Map();
    for (const entries of Object.values(groups)) {
        const values = entries.map(e => e.value);
        const lo = Math.min(...values), hi = Math.max(...values);
        for (const { key, value } of entries) {
            tierMap.set(key, { tier: valueBandTier(value, lo, hi), value });
        }
    }
    return tierMap;
}

/**
 * Draw (or refresh) the value overlay on the map SVG.
 * Safe to call repeatedly — always removes the previous layer first.
 */
/** The last overlay drawn, so a change to the Milty weights can redraw it as it was. */
let lastDraw = null;
let followingWeights = false;

export function drawValueOverlay(editor, rOn = false, iOn = false, tOn = false) {
    clearValueOverlay(editor);
    lastDraw = { editor, rOn, iOn, tOn };
    // The tiers are made of the Milty weights, so an edit in the Weighting Settings redraws
    // an overlay that is on screen rather than leaving it showing the old ranking.
    if (!followingWeights) {
        followingWeights = true;
        subscribeWeights(() => {
            if (lastDraw && isValueOverlayActive(lastDraw.editor)) {
                drawValueOverlay(lastDraw.editor, lastDraw.rOn, lastDraw.iOn, lastDraw.tOn);
            }
        });
    }

    const factors = getFactors(rOn, iOn, tOn);
    const tierMap = buildValueTiers(editor, factors);
    if (!tierMap.size) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'valueOverlayLayer';
    layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const r = (editor.hexRadius || 40) * 0.90;

    for (const [label, { tier }] of tierMap) {
        const hex = editor.hexes[label];
        if (!hex?.center) continue;
        const { x, y } = hex.center;

        // Coloured fill
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', hexPoints({ x, y }, r));
        poly.setAttribute('fill', TIER_FILL[tier]);
        poly.setAttribute('stroke', 'none');
        layer.appendChild(poly);

        // Tier badge — small circle in the top-right of the hex
        const bx = x + r * 0.50;
        const by = y - r * 0.42;
        const badgeCirc = document.createElementNS(SVG_NS, 'circle');
        badgeCirc.setAttribute('cx', bx); badgeCirc.setAttribute('cy', by);
        badgeCirc.setAttribute('r', 9);
        badgeCirc.setAttribute('fill', TIER_TEXT[tier]);
        badgeCirc.setAttribute('stroke', '#000');
        badgeCirc.setAttribute('stroke-width', '0.8');
        layer.appendChild(badgeCirc);
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', bx);
        txt.setAttribute('y', by + 4);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('fill', '#fff');
        txt.setAttribute('stroke', '#000');
        txt.setAttribute('stroke-width', '0.3');
        txt.setAttribute('paint-order', 'stroke');
        txt.textContent = `T${tier}`;
        layer.appendChild(txt);
    }

    announceValueOverlayChange();
}

export function clearValueOverlay(editor) {
    editor?.svg?.querySelector('#valueOverlayLayer')?.remove();
    announceValueOverlayChange();
}

/** True if the overlay is currently shown. */
export function isValueOverlayActive(editor) {
    return !!editor?.svg?.querySelector('#valueOverlayLayer');
}

/**
 * Fired whenever the value overlay is drawn or cleared.
 *
 * This overlay has two switches, in different popups: "Value Tiers (T1-T5)" in Toggle
 * Overlays, and "Show Value Overlay" in the Balance panel. They used to keep separate state —
 * one probed the DOM, the other held a flag on its own button — so using one left the
 * other showing the opposite. The drawn layer is the only truth; this event is how a
 * button that did not cause the change hears about it.
 */
export const VALUE_OVERLAY_CHANGED = 'ti4:value-overlay-changed';

function announceValueOverlayChange() {
    // The pure helpers in this file are imported under node, where there is no document.
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(VALUE_OVERLAY_CHANGED));
}

// ── Value TARGET layer ─────────────────────────────────────────────────────
// Shows which tier the user has *painted* as a target on each hex.
// Drawn as badges in the bottom-right corner of the hex.

/**
 * Redraws the value-target indicator layer from scratch.
 * Call after any hex.valueTarget change.
 */
const SKEW_COLORS = { r: '#f5a623', i: '#7ecfff', t: '#b07cff' };
const TIER_BADGE_COLORS = ['#ff6b6b', '#ffa94d', '#ffe066', '#a9e34b', '#40c057'];

export function drawValueTargetLayer(editor) {
    editor?.svg?.querySelector('#valueTargetLayer')?.remove();

    const hasAny = Object.values(editor.hexes).some(h => h.valueTarget);
    if (!hasAny) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'valueTargetLayer';
    layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const r = (editor.hexRadius || 40);
    const BADGE_R = 8;   // tier badge radius
    const DOT_R = 5;   // skew dot radius

    for (const [, hex] of Object.entries(editor.hexes)) {
        const vt = hex.valueTarget;
        if (!vt || !hex.center) continue;
        const { x, y } = hex.center;

        // Tier badge — lower in the hex so it's clearly inside
        const tierCx = x + r * 0.40;
        const tierCy = y + r * 0.55;

        if (vt.tier) {
            const color = TIER_BADGE_COLORS[vt.tier - 1] || '#aaa';
            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', tierCx); circle.setAttribute('cy', tierCy);
            circle.setAttribute('r', BADGE_R);
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', '#000'); circle.setAttribute('stroke-width', '1');
            layer.appendChild(circle);
            const txt = document.createElementNS(SVG_NS, 'text');
            txt.setAttribute('x', tierCx); txt.setAttribute('y', tierCy + 3.5);
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('font-size', '8'); txt.setAttribute('font-weight', 'bold');
            txt.setAttribute('fill', '#111');
            txt.textContent = vt.tier;
            layer.appendChild(txt);
        }

        // Skew dots — slightly overlap the tier badge, starting bottom-left (135°)
        // and stepping further left for each additional dot.
        const skewKeys = [['r', 'R'], ['i', 'I'], ['t', 'T']].filter(([k]) => vt[k]);
        if (skewKeys.length > 0) {
            const edgeDist = BADGE_R + DOT_R - 3; // slight overlap (3px into tier badge)
            const BASE_ANGLE = 3 * Math.PI / 4;   // 135° = bottom-left diagonal
            const STEP       = Math.PI / 8;        // 22.5° per additional dot
            skewKeys.forEach(([key, label], i) => {
                const ang   = BASE_ANGLE + i * STEP;
                const color = SKEW_COLORS[key];
                const dx    = tierCx + edgeDist * Math.cos(ang);
                const dy    = tierCy + edgeDist * Math.sin(ang);
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', dx); circle.setAttribute('cy', dy);
                circle.setAttribute('r', DOT_R);
                circle.setAttribute('fill', color);
                circle.setAttribute('stroke', '#000'); circle.setAttribute('stroke-width', '0.8');
                layer.appendChild(circle);
                const txt = document.createElementNS(SVG_NS, 'text');
                txt.setAttribute('x', dx); txt.setAttribute('y', dy + 2.5);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-size', '6'); txt.setAttribute('font-weight', 'bold');
                txt.setAttribute('fill', '#111');
                txt.textContent = label;
                layer.appendChild(txt);
            });
        }
    }
}

export function clearValueTargetLayer(editor) {
    editor?.svg?.querySelector('#valueTargetLayer')?.remove();
}
