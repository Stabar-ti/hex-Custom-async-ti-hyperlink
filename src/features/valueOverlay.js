// src/features/valueOverlay.js
// Milty-style value tier overlay (1–5) for assigned system hexes.
// Each hex gets a coloured semi-transparent fill and a tier badge based on
// how its ideal R/I + tech score ranks among all currently placed systems.

const SVG_NS = 'http://www.w3.org/2000/svg';

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
 * Compute the milty optimal value of one system.
 * Uses the flex calculation: planets where res=inf contribute 50/50.
 */
export function calculateSystemValue(sys, { f_R = 1.0, f_I = 1.0, f_T = 2.0 } = {}) {
    const planets = Array.isArray(sys?.planets) ? sys.planets : [];
    if (!planets.length) return 0;

    let idealR = 0, idealI = 0, techCount = 0;
    for (const p of planets) {
        const r = p.resources || 0;
        const i = p.influence || 0;
        if (r > i) idealR += r;
        else if (i > r) idealI += i;
        else { idealR += r / 2; idealI += i / 2; }

        if (p.techSpecialty) techCount++;
        if (Array.isArray(p.techSpecialties)) techCount += p.techSpecialties.length;
    }

    return f_R * idealR + f_I * idealI + f_T * techCount;
}

/**
 * Classify a system into a type group for per-group scaling.
 * 1p / 2p / 3p+ / legendary / empty each get their own percentile band
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

/** Assign percentile tiers within one sorted group of {key, value} entries. */
function percentileTiers(sorted) {
    const n = sorted.length;
    const result = new Map();
    sorted.forEach(({ key, value }, idx) => {
        const pct = idx / n;
        const tier = pct < 0.2 ? 1 : pct < 0.4 ? 2 : pct < 0.6 ? 3 : pct < 0.8 ? 4 : 5;
        result.set(key, { tier, value });
    });
    return result;
}

/**
 * Score every placed system and return Map<hexLabel, {tier, value}>.
 * Tiers are computed SEPARATELY per type group (1-planet, 2-planet, 3+-planet, etc.)
 * so tier 5 always means "best available of that planet count", not "best overall".
 */
export function buildValueTiers(editor, factors) {
    const lookup = editor.sectorIDLookup || {};
    const groups = {};

    for (const [label, hex] of Object.entries(editor.hexes)) {
        if (!hex.realId) continue;
        const sys = lookup[hex.realId.toString().toUpperCase()];
        if (!sys) continue;
        const group = getTypeGroup(sys);
        if (!groups[group]) groups[group] = [];
        groups[group].push({ key: label, value: calculateSystemValue(sys, factors) });
    }

    if (!Object.keys(groups).length) return new Map();

    const tierMap = new Map();
    for (const entries of Object.values(groups)) {
        entries.sort((a, b) => a.value - b.value);
        for (const [k, v] of percentileTiers(entries)) tierMap.set(k, v);
    }
    return tierMap;
}

/** Compute the six corner points of a flat-top hexagon centred at (cx, cy). */
function hexPoints(cx, cy, r) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i);
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(' ');
}

/**
 * Draw (or refresh) the value overlay on the map SVG.
 * Safe to call repeatedly — always removes the previous layer first.
 */
export function drawValueOverlay(editor, rOn = false, iOn = false, tOn = false) {
    clearValueOverlay(editor);

    const factors = getFactors(rOn, iOn, tOn);
    const tierMap = buildValueTiers(editor, factors);
    if (!tierMap.size) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'valueOverlayLayer';
    layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const r = (editor.hexRadius || 40) * 0.90;

    for (const [label, { tier, value }] of tierMap) {
        const hex = editor.hexes[label];
        if (!hex?.center) continue;
        const { x, y } = hex.center;

        // Coloured fill
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', hexPoints(x, y, r));
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
}

export function clearValueOverlay(editor) {
    editor?.svg?.querySelector('#valueOverlayLayer')?.remove();
}

/** True if the overlay is currently shown. */
export function isValueOverlayActive(editor) {
    return !!editor?.svg?.querySelector('#valueOverlayLayer');
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
